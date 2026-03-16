import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.security import decrypt_password, encrypt_password
from ..db import crud
from ..db.models import MCPApproval, MCPServer, User
from ..services.ai_service import ai_service
from .transports import MCPRemoteTransport, MCPStdioTransport
from .types import MCPPlannedCall, MCPResolvedTool

logger = logging.getLogger(__name__)
SENSITIVE_KEY_PATTERN = re.compile(r"(token|secret|password|authorization|api[_-]?key|cookie|session)", re.IGNORECASE)


class MCPService:
    def _safe_json_load(self, raw: Optional[str], fallback: Any) -> Any:
        if not raw:
            return fallback
        try:
            return json.loads(raw)
        except Exception:
            return fallback

    def _tool_alias(self, server_id: int, tool_name: str) -> str:
        safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", tool_name)
        return f"mcp_{server_id}_{safe_name}"

    def _truncate_text(self, text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        return f"{text[:limit]}...<truncated:{len(text) - limit}>"

    def _sanitize_for_log(self, value: Any, depth: int = 0) -> Any:
        if depth > 4:
            return "<depth_limit>"

        if isinstance(value, dict):
            out: dict[str, Any] = {}
            items = list(value.items())
            for idx, (key, val) in enumerate(items):
                if idx >= settings.MCP_MAX_LOG_ITEMS:
                    out["__truncated_items__"] = len(items) - settings.MCP_MAX_LOG_ITEMS
                    break
                key_str = str(key)
                if SENSITIVE_KEY_PATTERN.search(key_str):
                    out[key_str] = "***"
                else:
                    out[key_str] = self._sanitize_for_log(val, depth + 1)
            return out

        if isinstance(value, list):
            out_list: list[Any] = []
            for idx, item in enumerate(value):
                if idx >= settings.MCP_MAX_LOG_ITEMS:
                    out_list.append(f"<truncated_items:{len(value) - settings.MCP_MAX_LOG_ITEMS}>")
                    break
                out_list.append(self._sanitize_for_log(item, depth + 1))
            return out_list

        if isinstance(value, str):
            return self._truncate_text(value, settings.MCP_MAX_LOG_STRING_CHARS)

        return value

    def _json_size_bytes(self, value: dict[str, Any]) -> int:
        return len(json.dumps(value, ensure_ascii=False).encode("utf-8"))

    def _is_expected_type(self, value: Any, expected_type: str) -> bool:
        if expected_type == "string":
            return isinstance(value, str)
        if expected_type == "boolean":
            return isinstance(value, bool)
        if expected_type == "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        if expected_type == "number":
            return (isinstance(value, int) or isinstance(value, float)) and not isinstance(value, bool)
        if expected_type == "object":
            return isinstance(value, dict)
        if expected_type == "array":
            return isinstance(value, list)
        if expected_type == "null":
            return value is None
        return True

    def _validate_schema_value(self, value: Any, schema: dict[str, Any], path: str = "$") -> None:
        if not isinstance(schema, dict):
            return

        expected_type = schema.get("type")
        if expected_type:
            expected = expected_type if isinstance(expected_type, list) else [expected_type]
            if not any(self._is_expected_type(value, item) for item in expected if isinstance(item, str)):
                raise RuntimeError(f"MCP argument type mismatch at {path}: expected {expected_type}")

        enum_values = schema.get("enum")
        if isinstance(enum_values, list) and enum_values and value not in enum_values:
            raise RuntimeError(f"MCP argument enum mismatch at {path}")

        if isinstance(value, dict):
            props = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
            required = schema.get("required") if isinstance(schema.get("required"), list) else []
            additional = schema.get("additionalProperties", True)

            for req in required:
                if isinstance(req, str) and req not in value:
                    raise RuntimeError(f"MCP missing required argument at {path}.{req}")

            for key, val in value.items():
                child_path = f"{path}.{key}"
                if key in props and isinstance(props[key], dict):
                    self._validate_schema_value(val, props[key], child_path)
                elif additional is False:
                    raise RuntimeError(f"MCP argument not allowed at {child_path}")
                elif isinstance(additional, dict):
                    self._validate_schema_value(val, additional, child_path)

        if isinstance(value, list):
            item_schema = schema.get("items") if isinstance(schema.get("items"), dict) else None
            if item_schema:
                for idx, item in enumerate(value):
                    self._validate_schema_value(item, item_schema, f"{path}[{idx}]")

    def _validate_arguments(self, tool: MCPResolvedTool, arguments: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(arguments, dict):
            raise RuntimeError("MCP arguments must be an object")

        if self._json_size_bytes(arguments) > settings.MCP_MAX_ARGUMENT_BYTES:
            raise RuntimeError("MCP arguments are too large")

        schema = tool.input_schema if isinstance(tool.input_schema, dict) else {}
        if schema:
            self._validate_schema_value(arguments, schema, "$")
        return arguments

    async def _build_transport(self, db: AsyncSession, server: MCPServer, user: Optional[User] = None):
        timeout_ms = server.timeout_ms or settings.MCP_DEFAULT_TIMEOUT_MS
        retry_count = server.retry_count or 1

        if server.transport == "stdio":
            args = self._safe_json_load(server.args_json, [])
            envs = self._safe_json_load(server.env_json, {})
            if not server.command:
                raise RuntimeError("stdio MCP server command is empty")
            return MCPStdioTransport(
                command=server.command,
                args=[str(item) for item in args] if isinstance(args, list) else [],
                env={str(k): str(v) for k, v in envs.items()} if isinstance(envs, dict) else {},
                timeout_ms=timeout_ms,
                retry_count=retry_count,
                backoff_ms=settings.MCP_RETRY_BACKOFF_MS,
            )

        if not server.base_url:
            raise RuntimeError("remote MCP server base_url is empty")

        headers = self._safe_json_load(server.headers_json, {})
        if not isinstance(headers, dict):
            headers = {}

        if user:
            user_secret = await crud.get_mcp_user_connection(db, user.id, server.id)
            if user_secret and user_secret.secret_ciphertext:
                token = decrypt_password(user_secret.secret_ciphertext)
                if token and token != "******":
                    headers["Authorization"] = f"Bearer {token}"

        if "Authorization" not in headers:
            secret = await crud.get_mcp_server_secret(db, server.id)
            if secret and secret.secret_ciphertext:
                token = decrypt_password(secret.secret_ciphertext)
                if token and token != "******":
                    headers["Authorization"] = f"Bearer {token}"

        return MCPRemoteTransport(
            base_url=server.base_url,
            headers={str(k): str(v) for k, v in headers.items()},
            timeout_ms=timeout_ms,
            retry_count=retry_count,
            backoff_ms=settings.MCP_RETRY_BACKOFF_MS,
            circuit_failure_threshold=settings.MCP_CIRCUIT_BREAKER_THRESHOLD,
            circuit_cooldown_seconds=settings.MCP_CIRCUIT_BREAKER_COOLDOWN_SECONDS,
        )

    async def _get_transport(
        self,
        db: AsyncSession,
        server_id: int,
        user: Optional[User],
        transport_cache: Optional[dict[tuple[int, int], Any]],
    ):
        cache_key = (server_id, user.id if user else 0)
        if transport_cache is not None and cache_key in transport_cache:
            return transport_cache[cache_key]

        server = await crud.get_mcp_server_by_id(db, server_id)
        if not server:
            raise RuntimeError(f"MCP server missing: {server_id}")

        transport = await self._build_transport(db, server, user=user)
        if transport_cache is not None:
            transport_cache[cache_key] = transport
        return transport

    def _normalize_tool(self, tool: dict[str, Any]) -> dict[str, Any]:
        name = str(tool.get("name", "")).strip()
        if not name:
            return {}
        return {
            "name": name,
            "description": str(tool.get("description", "")).strip(),
            "inputSchema": tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {},
        }

    async def list_chat_servers(self, db: AsyncSession, user: User) -> list[dict[str, Any]]:
        servers = await crud.get_mcp_servers(db, active_only=True)
        user_connections = await crud.list_mcp_user_connections(db, user.id)
        connected_server_ids = {item.server_id for item in user_connections}
        results: list[dict[str, Any]] = []
        for server in servers:
            tools = await crud.get_mcp_tools(db, server.id, enabled_only=True)
            results.append(
                {
                    "id": server.id,
                    "name": server.name,
                    "transport": server.transport,
                    "tool_count": len(tools),
                    "connected": server.id in connected_server_ids,
                }
            )
        return results

    async def list_user_connections(self, db: AsyncSession, user: User) -> list[dict[str, Any]]:
        servers = await crud.get_mcp_servers(db, active_only=True)
        records = await crud.list_mcp_user_connections(db, user.id)
        mapped = {item.server_id: item for item in records}
        results: list[dict[str, Any]] = []
        for server in servers:
            record = mapped.get(server.id)
            results.append(
                {
                    "server_id": server.id,
                    "server_name": server.name,
                    "transport": server.transport,
                    "connected": record is not None,
                    "updated_at": record.updated_at.isoformat() if record and record.updated_at else None,
                }
            )
        return results

    async def upsert_user_connection(self, db: AsyncSession, user: User, server_id: int, bearer_token: str) -> dict[str, Any]:
        server = await crud.get_mcp_server_by_id(db, server_id)
        if not server or not server.is_active:
            raise RuntimeError("MCP server not found or inactive")
        if server.transport != "remote":
            raise RuntimeError("only remote MCP server supports user credentials")

        token = bearer_token.strip()
        if not token:
            raise RuntimeError("bearer token is empty")

        record = await crud.set_mcp_user_connection_secret(
            db,
            user_id=user.id,
            server_id=server_id,
            secret_ciphertext=encrypt_password(token),
            auth_type="bearer",
        )
        return {
            "server_id": server.id,
            "server_name": server.name,
            "connected": True,
            "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        }

    async def delete_user_connection(self, db: AsyncSession, user: User, server_id: int) -> bool:
        return await crud.delete_mcp_user_connection(db, user.id, server_id)

    async def list_admin_servers(self, db: AsyncSession) -> list[dict[str, Any]]:
        servers = await crud.get_mcp_servers(db, active_only=False)
        results: list[dict[str, Any]] = []
        for server in servers:
            tools = await crud.get_mcp_tools(db, server.id, enabled_only=False)
            results.append(
                {
                    "id": server.id,
                    "name": server.name,
                    "transport": server.transport,
                    "is_active": server.is_active,
                    "base_url": server.base_url,
                    "command": server.command,
                    "args_json": server.args_json,
                    "env_json": server.env_json,
                    "headers_json": server.headers_json,
                    "timeout_ms": server.timeout_ms,
                    "retry_count": server.retry_count,
                    "created_at": server.created_at.isoformat() if server.created_at else None,
                    "updated_at": server.updated_at.isoformat() if server.updated_at else None,
                    "tool_count": len(tools),
                }
            )
        return results

    async def create_server(
        self,
        db: AsyncSession,
        *,
        name: str,
        transport: str,
        is_active: bool = True,
        base_url: Optional[str] = None,
        command: Optional[str] = None,
        args_json: Optional[str] = None,
        env_json: Optional[str] = None,
        headers_json: Optional[str] = None,
        timeout_ms: int = 15000,
        retry_count: int = 1,
        bearer_token: Optional[str] = None,
    ) -> Optional[MCPServer]:
        server = await crud.create_mcp_server(
            db,
            name=name,
            transport=transport,
            is_active=is_active,
            base_url=base_url,
            command=command,
            args_json=args_json,
            env_json=env_json,
            headers_json=headers_json,
            timeout_ms=timeout_ms,
            retry_count=retry_count,
        )
        if server and bearer_token:
            await crud.set_mcp_server_secret(
                db,
                server.id,
                encrypt_password(bearer_token.strip()),
                key_version="v1",
            )
        return server

    async def update_server(self, db: AsyncSession, server_id: int, **kwargs) -> Optional[MCPServer]:
        bearer_token = kwargs.pop("bearer_token", None)
        clear_bearer_token = bool(kwargs.pop("clear_bearer_token", False))
        server = await crud.update_mcp_server(db, server_id, **kwargs)
        if not server:
            return None

        if clear_bearer_token:
            await crud.delete_mcp_server_secret(db, server.id)
        elif bearer_token is not None:
            token = str(bearer_token).strip()
            if token:
                await crud.set_mcp_server_secret(
                    db,
                    server.id,
                    encrypt_password(token),
                    key_version="v1",
                )
        return server

    async def test_server(self, db: AsyncSession, server_id: int) -> dict[str, Any]:
        server = await crud.get_mcp_server_by_id(db, server_id)
        if not server:
            raise RuntimeError("MCP server not found")
        start = time.perf_counter()
        transport = await self._build_transport(db, server, user=None)
        tools = await transport.list_tools()
        latency = int((time.perf_counter() - start) * 1000)
        return {"success": True, "latency_ms": latency, "tools": len(tools)}

    async def refresh_server_tools(self, db: AsyncSession, server_id: int) -> list[dict[str, Any]]:
        server = await crud.get_mcp_server_by_id(db, server_id)
        if not server:
            raise RuntimeError("MCP server not found")
        transport = await self._build_transport(db, server, user=None)
        tools = await transport.list_tools()
        normalized = [self._normalize_tool(item) for item in tools]
        normalized = [item for item in normalized if item]

        for item in normalized:
            await crud.upsert_mcp_tool_cache(
                db,
                server_id=server_id,
                tool_name=item["name"],
                description=item["description"],
                input_schema_json=json.dumps(item["inputSchema"], ensure_ascii=False),
            )

        tool_names = [item["name"] for item in normalized]
        await crud.delete_mcp_tools_not_in(db, server_id, tool_names)
        return normalized

    async def list_server_tools(self, db: AsyncSession, server_id: int) -> list[dict[str, Any]]:
        tools = await crud.get_mcp_tools(db, server_id, enabled_only=False)
        results: list[dict[str, Any]] = []
        for tool in tools:
            results.append(
                {
                    "tool_name": tool.tool_name,
                    "description": tool.description,
                    "input_schema": self._safe_json_load(tool.input_schema_json, {}),
                    "is_enabled": tool.is_enabled,
                    "requires_approval": tool.requires_approval,
                    "updated_at": tool.updated_at.isoformat() if tool.updated_at else None,
                }
            )
        return results

    async def update_tool_flags(
        self,
        db: AsyncSession,
        server_id: int,
        tool_name: str,
        *,
        is_enabled: Optional[bool] = None,
        requires_approval: Optional[bool] = None,
    ):
        return await crud.update_mcp_tool_flags(
            db,
            server_id=server_id,
            tool_name=tool_name,
            is_enabled=is_enabled,
            requires_approval=requires_approval,
        )

    def _normalize_resource(self, item: dict[str, Any]) -> dict[str, Any]:
        uri = str(item.get("uri", "")).strip()
        if not uri:
            return {}
        return {
            "uri": uri,
            "name": str(item.get("name", "")).strip() or uri,
            "description": str(item.get("description", "")).strip(),
            "mimeType": str(item.get("mimeType", "")).strip(),
        }

    def _normalize_prompt(self, item: dict[str, Any]) -> dict[str, Any]:
        name = str(item.get("name", "")).strip()
        if not name:
            return {}
        return {
            "name": name,
            "description": str(item.get("description", "")).strip(),
            "arguments": item.get("arguments") if isinstance(item.get("arguments"), list) else [],
        }

    async def list_server_resources(self, db: AsyncSession, server_id: int) -> list[dict[str, Any]]:
        server = await crud.get_mcp_server_by_id(db, server_id)
        if not server:
            raise RuntimeError("MCP server not found")
        transport = await self._build_transport(db, server, user=None)
        resources = await transport.list_resources()
        normalized = [self._normalize_resource(item) for item in resources if isinstance(item, dict)]
        return [item for item in normalized if item]

    async def read_server_resource(self, db: AsyncSession, server_id: int, uri: str) -> dict[str, Any]:
        server = await crud.get_mcp_server_by_id(db, server_id)
        if not server:
            raise RuntimeError("MCP server not found")
        transport = await self._build_transport(db, server, user=None)
        result = await transport.read_resource(uri)
        return result if isinstance(result, dict) else {"result": result}

    async def list_server_prompts(self, db: AsyncSession, server_id: int) -> list[dict[str, Any]]:
        server = await crud.get_mcp_server_by_id(db, server_id)
        if not server:
            raise RuntimeError("MCP server not found")
        transport = await self._build_transport(db, server, user=None)
        prompts = await transport.list_prompts()
        normalized = [self._normalize_prompt(item) for item in prompts if isinstance(item, dict)]
        return [item for item in normalized if item]

    async def get_server_prompt(
        self,
        db: AsyncSession,
        server_id: int,
        name: str,
        arguments: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        server = await crud.get_mcp_server_by_id(db, server_id)
        if not server:
            raise RuntimeError("MCP server not found")
        transport = await self._build_transport(db, server, user=None)
        result = await transport.get_prompt(name, arguments or {})
        return result if isinstance(result, dict) else {"result": result}

    async def _get_resolved_tools(self, db: AsyncSession, selected_server_ids: Optional[list[int]]) -> list[MCPResolvedTool]:
        servers = await crud.get_mcp_servers(db, active_only=True)
        if selected_server_ids:
            allowed = set(selected_server_ids)
            servers = [server for server in servers if server.id in allowed]

        resolved: list[MCPResolvedTool] = []
        for server in servers:
            cached_tools = await crud.get_mcp_tools(db, server.id, enabled_only=True)
            if not cached_tools:
                try:
                    await self.refresh_server_tools(db, server.id)
                except Exception as exc:  # noqa: PERF203
                    logger.warning("refresh mcp tools failed for server=%s err=%s", server.id, exc)
                cached_tools = await crud.get_mcp_tools(db, server.id, enabled_only=True)

            for tool in cached_tools:
                resolved.append(
                    MCPResolvedTool(
                        server_id=server.id,
                        server_name=server.name,
                        transport=server.transport,
                        name=tool.tool_name,
                        alias=self._tool_alias(server.id, tool.tool_name),
                        description=tool.description or "",
                        input_schema=self._safe_json_load(tool.input_schema_json, {}),
                        requires_approval=bool(tool.requires_approval),
                        timeout_ms=server.timeout_ms or settings.MCP_DEFAULT_TIMEOUT_MS,
                        retry_count=server.retry_count or 1,
                    )
                )
        return resolved

    def _extract_json_object(self, text: str) -> dict[str, Any]:
        if not text:
            return {}
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return {}
        try:
            data = json.loads(text[start : end + 1])
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    async def _plan_calls_native(
        self,
        history_messages: list[dict[str, Any]],
        tools: list[MCPResolvedTool],
        model: Optional[str],
    ) -> list[MCPPlannedCall]:
        if not tools:
            return []

        alias_to_tool = {item.alias: item for item in tools}
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": item.alias,
                    "description": f"[{item.server_name}] {item.description or item.name}",
                    "parameters": item.input_schema or {"type": "object", "properties": {}},
                },
            }
            for item in tools
        ]

        response = await ai_service.client.chat.completions.create(
            model=model or ai_service.default_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a tool planner. Choose MCP tools only when they materially improve correctness. "
                        "If no tool is needed, do not call any tool."
                    ),
                },
                *history_messages[-8:],
            ],
            tools=openai_tools,
            tool_choice="auto",
            temperature=0,
            max_tokens=300,
        )

        planned: list[MCPPlannedCall] = []
        message = response.choices[0].message if response.choices else None
        tool_calls = getattr(message, "tool_calls", None) if message else None
        if not tool_calls:
            return []

        for call in tool_calls[: settings.MCP_MAX_TOOL_CALLS]:
            fn = getattr(call, "function", None)
            if not fn:
                continue
            alias = str(getattr(fn, "name", "")).strip()
            if alias not in alias_to_tool:
                continue
            raw_args = getattr(fn, "arguments", "{}")
            try:
                args = json.loads(raw_args) if raw_args else {}
            except Exception:
                args = {}
            if not isinstance(args, dict):
                args = {}
            planned.append(MCPPlannedCall(alias=alias, arguments=args, reason="native_tool_call"))
        return planned

    async def _plan_calls_fallback(
        self,
        history_messages: list[dict[str, Any]],
        tools: list[MCPResolvedTool],
        model: Optional[str],
    ) -> list[MCPPlannedCall]:
        if not tools:
            return []
        tool_lines = []
        for item in tools:
            tool_lines.append(
                {
                    "tool": item.alias,
                    "description": item.description or item.name,
                    "schema": item.input_schema or {"type": "object", "properties": {}},
                }
            )

        response = await ai_service.client.chat.completions.create(
            model=model or ai_service.default_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a tool planner. Return only JSON object:\n"
                        '{"calls":[{"tool":"alias","arguments":{},"reason":"..."}]}\n'
                        "If no tool needed, return {\"calls\":[]}.\n"
                        f"Available tools: {json.dumps(tool_lines, ensure_ascii=False)}"
                    ),
                },
                *history_messages[-8:],
            ],
            temperature=0,
            max_tokens=400,
        )
        content = response.choices[0].message.content if response.choices else ""
        data = self._extract_json_object(content or "")
        calls = data.get("calls", [])
        if not isinstance(calls, list):
            return []

        valid_alias = {item.alias for item in tools}
        planned: list[MCPPlannedCall] = []
        for call in calls[: settings.MCP_MAX_TOOL_CALLS]:
            if not isinstance(call, dict):
                continue
            alias = str(call.get("tool", "")).strip()
            if alias not in valid_alias:
                continue
            arguments = call.get("arguments", {})
            if not isinstance(arguments, dict):
                arguments = {}
            reason = str(call.get("reason", "")).strip()
            planned.append(MCPPlannedCall(alias=alias, arguments=arguments, reason=reason))
        return planned

    async def _plan_calls(
        self,
        history_messages: list[dict[str, Any]],
        tools: list[MCPResolvedTool],
        model: Optional[str],
    ) -> list[MCPPlannedCall]:
        try:
            native_calls = await self._plan_calls_native(history_messages, tools, model)
            if native_calls:
                return native_calls
        except Exception as exc:  # noqa: PERF203
            logger.warning("native mcp planning failed: %s", exc)

        try:
            return await self._plan_calls_fallback(history_messages, tools, model)
        except Exception as exc:  # noqa: PERF203
            logger.warning("fallback mcp planning failed: %s", exc)
            return []

    def _normalize_tool_messages(self, messages: Any) -> list[dict[str, str]]:
        if not isinstance(messages, list):
            return []
        results: list[dict[str, str]] = []
        for item in messages[: settings.MCP_MAX_TOOL_CALLS * 2 + 4]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "assistant").strip().lower()
            content = str(item.get("content") or "").strip()
            if not content:
                continue
            if role not in {"assistant", "system"}:
                role = "assistant"
            results.append({"role": role, "content": self._truncate_text(content, settings.MCP_MAX_RESULT_TEXT_CHARS)})
        return results

    async def _log_run(
        self,
        db: AsyncSession,
        *,
        request_id: str,
        user_id: int,
        session_id: int,
        step_type: str,
        status: str,
        server_id: Optional[int] = None,
        tool_name: Optional[str] = None,
        input_data: Optional[dict[str, Any]] = None,
        output_data: Optional[dict[str, Any]] = None,
        error_code: Optional[str] = None,
        latency_ms: Optional[int] = None,
    ) -> None:
        await crud.create_mcp_run_log(
            db,
            request_id=request_id,
            user_id=user_id,
            session_id=session_id,
            step_type=step_type,
            server_id=server_id,
            tool_name=tool_name,
            input_data=self._sanitize_for_log(input_data) if input_data is not None else None,
            output_data=self._sanitize_for_log(output_data) if output_data is not None else None,
            status=status,
            error_code=error_code,
            latency_ms=latency_ms,
        )

    def _serialize_call(self, tool: MCPResolvedTool, call: MCPPlannedCall, arguments: dict[str, Any]) -> dict[str, Any]:
        return {
            "alias": tool.alias,
            "server_id": tool.server_id,
            "server_name": tool.server_name,
            "tool_name": tool.name,
            "arguments": arguments,
            "reason": call.reason,
            "requires_approval": bool(tool.requires_approval),
            "input_schema": tool.input_schema if isinstance(tool.input_schema, dict) else {},
        }

    def _deserialize_call(self, payload: Any) -> tuple[MCPResolvedTool, MCPPlannedCall] | None:
        if not isinstance(payload, dict):
            return None
        try:
            server_id = int(payload.get("server_id"))
        except Exception:
            return None

        tool_name = str(payload.get("tool_name") or "").strip()
        alias = str(payload.get("alias") or "").strip()
        if not tool_name or not alias:
            return None

        arguments = payload.get("arguments", {})
        if not isinstance(arguments, dict):
            arguments = {}

        tool = MCPResolvedTool(
            server_id=server_id,
            server_name=str(payload.get("server_name") or f"server-{server_id}"),
            transport="",
            name=tool_name,
            alias=alias,
            description="",
            input_schema=payload.get("input_schema") if isinstance(payload.get("input_schema"), dict) else {},
            requires_approval=bool(payload.get("requires_approval")),
            timeout_ms=settings.MCP_DEFAULT_TIMEOUT_MS,
            retry_count=1,
        )
        call = MCPPlannedCall(alias=alias, arguments=arguments, reason=str(payload.get("reason") or ""))
        return tool, call

    def _is_pending_poll_result(self, result: dict[str, Any]) -> bool:
        status = str(result.get("status") or "").strip().lower()
        return status in {"pending", "running", "processing", "queued"} and isinstance(result.get("poll"), dict)

    async def _poll_pending_result(self, transport: Any, initial_result: dict[str, Any]) -> dict[str, Any]:
        result = initial_result
        max_polls = settings.MCP_ASYNC_MAX_POLLS
        interval_ms = settings.MCP_ASYNC_POLL_INTERVAL_MS

        for _ in range(max_polls):
            if not self._is_pending_poll_result(result):
                return result

            poll = result.get("poll") if isinstance(result.get("poll"), dict) else {}
            poll_tool = str(poll.get("tool") or poll.get("name") or "").strip()
            poll_args = poll.get("arguments") if isinstance(poll.get("arguments"), dict) else {}
            interval_ms = int(poll.get("interval_ms") or interval_ms)
            if not poll_tool:
                break

            await asyncio.sleep(max(0.05, interval_ms / 1000))
            result = await transport.call_tool(poll_tool, poll_args)
            if not isinstance(result, dict):
                result = {"result": result}

        if self._is_pending_poll_result(result):
            return {"status": "timeout", "error": "async_poll_timeout", "last_result": result}
        return result

    async def _call_tool(
        self,
        db: AsyncSession,
        tool: MCPResolvedTool,
        arguments: dict[str, Any],
        user: User,
        transport_cache: Optional[dict[tuple[int, int], Any]] = None,
    ) -> dict[str, Any]:
        transport = await self._get_transport(
            db,
            server_id=tool.server_id,
            user=user,
            transport_cache=transport_cache,
        )
        result = await transport.call_tool(tool.name, arguments)
        result = result if isinstance(result, dict) else {"result": result}
        if self._is_pending_poll_result(result):
            result = await self._poll_pending_result(transport, result)
        return result

    def _tool_result_to_text(self, tool_result: dict[str, Any]) -> str:
        if not isinstance(tool_result, dict):
            return self._truncate_text(str(tool_result), settings.MCP_MAX_RESULT_TEXT_CHARS)
        content = tool_result.get("content")
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        text = item.get("text")
                        if text:
                            parts.append(str(text))
            if parts:
                return self._truncate_text("\n".join(parts), settings.MCP_MAX_RESULT_TEXT_CHARS)
        return self._truncate_text(json.dumps(tool_result, ensure_ascii=False), settings.MCP_MAX_RESULT_TEXT_CHARS)

    async def _create_approval(
        self,
        db: AsyncSession,
        *,
        request_id: str,
        session_id: int,
        user: User,
        model: Optional[str],
        mcp_mode: str,
        pending_call: dict[str, Any],
        remaining_calls: list[dict[str, Any]],
        tool_messages: list[dict[str, str]],
    ) -> tuple[MCPApproval, dict[str, Any]]:
        expires_at = datetime.utcnow() + timedelta(seconds=settings.MCP_APPROVAL_TTL_SECONDS)
        payload = {
            "request_id": request_id,
            "model": model,
            "mcp_mode": mcp_mode,
            "pending_call": pending_call,
            "remaining_calls": remaining_calls,
            "tool_messages": tool_messages,
        }
        approval = await crud.create_mcp_approval(
            db,
            request_id=request_id,
            session_id=session_id,
            user_id=user.id,
            tool_name=f"{pending_call.get('server_name', 'server')}/{pending_call.get('tool_name', 'tool')}",
            input_data=payload,
            expired_at=expires_at,
        )
        await self._log_run(
            db,
            request_id=request_id,
            user_id=user.id,
            session_id=session_id,
            step_type="approval",
            status="pending",
            server_id=int(pending_call.get("server_id") or 0) or None,
            tool_name=str(pending_call.get("tool_name") or ""),
            input_data={"arguments": pending_call.get("arguments"), "reason": pending_call.get("reason")},
            output_data={"approval_id": approval.id},
        )
        event_data = {
            "approval_id": approval.id,
            "server_name": pending_call.get("server_name"),
            "tool_name": pending_call.get("tool_name"),
            "arguments": pending_call.get("arguments", {}),
            "reason": pending_call.get("reason", ""),
            "expires_at": expires_at.isoformat(),
        }
        return approval, event_data

    async def _execute_calls(
        self,
        db: AsyncSession,
        *,
        request_id: str,
        session_id: int,
        user: User,
        model: Optional[str],
        mcp_mode: str,
        planned_calls: list[MCPPlannedCall],
        alias_map: dict[str, MCPResolvedTool],
        start_index: int = 0,
        skip_approval_index: Optional[int] = None,
        seed_tool_messages: Optional[list[dict[str, str]]] = None,
        events: Optional[list[dict[str, Any]]] = None,
        transport_cache: Optional[dict[tuple[int, int], Any]] = None,
    ) -> dict[str, Any]:
        tool_messages = list(seed_tool_messages or [])
        stream_events = list(events or [])

        for idx in range(start_index, min(len(planned_calls), settings.MCP_MAX_TOOL_CALLS)):
            call = planned_calls[idx]
            tool = alias_map.get(call.alias)
            if not tool:
                continue

            try:
                arguments = self._validate_arguments(tool, call.arguments)
            except Exception as exc:
                await self._log_run(
                    db,
                    request_id=request_id,
                    user_id=user.id,
                    session_id=session_id,
                    step_type="tool_result",
                    status="failed",
                    server_id=tool.server_id,
                    tool_name=tool.name,
                    input_data=call.arguments if isinstance(call.arguments, dict) else {},
                    output_data={"error": str(exc)},
                    error_code="invalid_arguments",
                )
                stream_events.append(
                    {
                        "type": "tool_result",
                        "data": {
                            "server_name": tool.server_name,
                            "tool_name": tool.name,
                            "error": f"invalid_arguments: {str(exc)}",
                        },
                    }
                )
                continue

            require_approval = bool(tool.requires_approval or mcp_mode == "manual")
            if require_approval and idx != skip_approval_index:
                pending_serialized = self._serialize_call(tool, call, arguments)
                remaining_serialized: list[dict[str, Any]] = []
                for next_call in planned_calls[idx + 1 : settings.MCP_MAX_TOOL_CALLS]:
                    next_tool = alias_map.get(next_call.alias)
                    if not next_tool:
                        continue
                    next_args = next_call.arguments if isinstance(next_call.arguments, dict) else {}
                    remaining_serialized.append(self._serialize_call(next_tool, next_call, next_args))

                approval, approval_event = await self._create_approval(
                    db,
                    request_id=request_id,
                    session_id=session_id,
                    user=user,
                    model=model,
                    mcp_mode=mcp_mode,
                    pending_call=pending_serialized,
                    remaining_calls=remaining_serialized,
                    tool_messages=tool_messages,
                )
                stream_events.append({"type": "approval_required", "data": approval_event})
                return {
                    "events": stream_events,
                    "tool_messages": tool_messages,
                    "approval": approval,
                    "approval_event": approval_event,
                }

            started = time.perf_counter()
            stream_events.append(
                {
                    "type": "tool_call",
                    "data": {
                        "server_name": tool.server_name,
                        "tool_name": tool.name,
                        "arguments": arguments,
                        "reason": call.reason,
                    },
                }
            )
            await self._log_run(
                db,
                request_id=request_id,
                user_id=user.id,
                session_id=session_id,
                step_type="tool_call",
                status="success",
                server_id=tool.server_id,
                tool_name=tool.name,
                input_data=arguments,
            )
            try:
                result = await self._call_tool(db, tool, arguments, user, transport_cache=transport_cache)
                latency_ms = int((time.perf_counter() - started) * 1000)
                await self._log_run(
                    db,
                    request_id=request_id,
                    user_id=user.id,
                    session_id=session_id,
                    step_type="tool_result",
                    status="success",
                    server_id=tool.server_id,
                    tool_name=tool.name,
                    output_data={
                        "server_name": tool.server_name,
                        "tool_name": tool.name,
                        "result": result,
                    },
                    latency_ms=latency_ms,
                )
                result_text = self._tool_result_to_text(result)
                stream_events.append(
                    {
                        "type": "tool_result",
                        "data": {
                            "server_name": tool.server_name,
                            "tool_name": tool.name,
                            "result": self._sanitize_for_log(result),
                            "latency_ms": latency_ms,
                        },
                    }
                )
                tool_messages.append(
                    {
                        "role": "assistant",
                        "content": (
                            f"[MCP Tool Result]\n"
                            f"Server: {tool.server_name}\n"
                            f"Tool: {tool.name}\n"
                            f"Output:\n{result_text}"
                        ),
                    }
                )
            except Exception as exc:  # noqa: PERF203
                await self._log_run(
                    db,
                    request_id=request_id,
                    user_id=user.id,
                    session_id=session_id,
                    step_type="tool_result",
                    status="failed",
                    server_id=tool.server_id,
                    tool_name=tool.name,
                    input_data=arguments,
                    output_data={"error": str(exc)},
                    error_code="mcp_call_failed",
                )
                stream_events.append(
                    {
                        "type": "tool_result",
                        "data": {
                            "server_name": tool.server_name,
                            "tool_name": tool.name,
                            "error": str(exc),
                        },
                    }
                )

        return {
            "events": stream_events,
            "tool_messages": tool_messages,
            "approval": None,
            "approval_event": None,
        }

    async def run_before_answer(
        self,
        db: AsyncSession,
        *,
        request_id: str,
        session_id: int,
        user: User,
        history_messages: list[dict[str, Any]],
        model: Optional[str],
        enable_mcp: bool,
        selected_server_ids: Optional[list[int]],
        mcp_mode: str,
    ) -> dict[str, Any]:
        if not enable_mcp or mcp_mode == "off":
            return {"events": [], "tool_messages": [], "approval": None}

        tools = await self._get_resolved_tools(db, selected_server_ids)
        if not tools:
            await self._log_run(
                db,
                request_id=request_id,
                user_id=user.id,
                session_id=session_id,
                step_type="plan",
                status="failed",
                error_code="no_mcp_tools",
            )
            return {
                "events": [{"type": "plan", "data": {"status": "no_tools"}}],
                "tool_messages": [],
                "approval": None,
            }

        planned_calls = await self._plan_calls(history_messages, tools, model)
        await self._log_run(
            db,
            request_id=request_id,
            user_id=user.id,
            session_id=session_id,
            step_type="plan",
            status="success",
            input_data={"mcp_mode": mcp_mode, "tool_count": len(tools)},
            output_data={"planned_calls": [item.alias for item in planned_calls]},
        )

        events: list[dict[str, Any]] = [
            {
                "type": "plan",
                "data": {
                    "status": "planned",
                    "planned_calls": [
                        {"alias": item.alias, "arguments": self._sanitize_for_log(item.arguments)}
                        for item in planned_calls
                    ],
                },
            }
        ]
        if not planned_calls:
            return {"events": events, "tool_messages": [], "approval": None}

        alias_map = {tool.alias: tool for tool in tools}
        execute_result = await self._execute_calls(
            db,
            request_id=request_id,
            session_id=session_id,
            user=user,
            model=model,
            mcp_mode=mcp_mode,
            planned_calls=planned_calls,
            alias_map=alias_map,
            start_index=0,
            skip_approval_index=None,
            seed_tool_messages=[],
            events=events,
            transport_cache={},
        )
        return execute_result

    async def resolve_approval(self, db: AsyncSession, approval_id: int, user: User, approved: bool) -> dict[str, Any]:
        approval = await crud.get_mcp_approval_by_id(db, approval_id)
        if not approval:
            raise RuntimeError("approval not found")
        if approval.user_id != user.id:
            raise RuntimeError("no permission for this approval")
        if approval.status != "pending":
            raise RuntimeError(f"approval already {approval.status}")

        if approval.expired_at and approval.expired_at < datetime.utcnow():
            await crud.update_mcp_approval_status(db, approval.id, "expired", approved_by=user.id)
            raise RuntimeError("approval expired")

        payload = self._safe_json_load(approval.input_json, {})
        request_id = str(payload.get("request_id") or approval.request_id)

        if not approved:
            await crud.update_mcp_approval_status(db, approval.id, "rejected", approved_by=user.id)
            content = "已取消该 MCP 工具调用。你可以继续提问或调整策略后重试。"
            message = await crud.create_message(db, approval.session_id, "assistant", content)
            await self._log_run(
                db,
                request_id=request_id,
                user_id=user.id,
                session_id=approval.session_id,
                step_type="approval",
                status="rejected",
                tool_name=approval.tool_name,
            )
            return {
                "status": "rejected",
                "message": {
                    "id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "thinking": message.thinking,
                    "created_at": message.created_at.isoformat() if message.created_at else None,
                },
            }

        await crud.update_mcp_approval_status(db, approval.id, "approved", approved_by=user.id)

        pending_raw = payload.get("pending_call")
        remaining_raw = payload.get("remaining_calls") if isinstance(payload.get("remaining_calls"), list) else []
        seed_tool_messages = self._normalize_tool_messages(payload.get("tool_messages"))
        model = payload.get("model")
        mcp_mode = str(payload.get("mcp_mode") or "auto")

        parsed_pending = self._deserialize_call(pending_raw)
        if not parsed_pending:
            raise RuntimeError("approval payload is invalid")

        parsed_calls: list[tuple[MCPResolvedTool, MCPPlannedCall]] = [parsed_pending]
        for item in remaining_raw:
            parsed = self._deserialize_call(item)
            if parsed:
                parsed_calls.append(parsed)

        alias_map: dict[str, MCPResolvedTool] = {}
        planned_calls: list[MCPPlannedCall] = []
        for resolved_tool, planned in parsed_calls[: settings.MCP_MAX_TOOL_CALLS]:
            alias_map[resolved_tool.alias] = resolved_tool
            planned_calls.append(planned)

        execute_result = await self._execute_calls(
            db,
            request_id=request_id,
            session_id=approval.session_id,
            user=user,
            model=model,
            mcp_mode=mcp_mode,
            planned_calls=planned_calls,
            alias_map=alias_map,
            start_index=0,
            skip_approval_index=0,
            seed_tool_messages=seed_tool_messages,
            events=[],
            transport_cache={},
        )

        if execute_result.get("approval"):
            return {
                "status": "pending_approval",
                "next_approval": execute_result.get("approval_event"),
                "events": execute_result.get("events", []),
            }

        history = await crud.get_session_messages(db, approval.session_id)
        messages = [{"role": msg.role, "content": msg.content} for msg in history[-10:]]
        messages.extend(execute_result.get("tool_messages", []))

        thinking, content = await ai_service.chat_simple(messages, model=model)
        if not content:
            content = "MCP 工具已执行完成。"

        saved = await crud.create_message(
            db,
            approval.session_id,
            "assistant",
            content,
            thinking=thinking or None,
        )
        if len(history) <= 1:
            first_user_content = history[0].content if history else "MCP 对话"
            title = await ai_service.generate_title(first_user_content)
            await crud.update_session(db, approval.session_id, title=title)

        last_tool_result = None
        for item in reversed(execute_result.get("events", [])):
            if item.get("type") == "tool_result":
                data = item.get("data")
                if isinstance(data, dict) and "result" in data:
                    last_tool_result = data.get("result")
                    break

        return {
            "status": "approved",
            "tool_result": last_tool_result,
            "events": execute_result.get("events", []),
            "message": {
                "id": saved.id,
                "role": saved.role,
                "content": saved.content,
                "thinking": saved.thinking,
                "created_at": saved.created_at.isoformat() if saved.created_at else None,
            },
        }

    async def get_run_logs(
        self,
        db: AsyncSession,
        *,
        user_id: Optional[int] = None,
        request_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        total, items = await crud.get_mcp_run_logs(
            db,
            user_id=user_id,
            request_id=request_id,
            page=page,
            page_size=page_size,
        )
        records = []
        for item in items:
            records.append(
                {
                    "id": item.id,
                    "request_id": item.request_id,
                    "session_id": item.session_id,
                    "user_id": item.user_id,
                    "step_type": item.step_type,
                    "server_id": item.server_id,
                    "tool_name": item.tool_name,
                    "input": self._safe_json_load(item.input_json, None),
                    "output": self._safe_json_load(item.output_json, None),
                    "status": item.status,
                    "error_code": item.error_code,
                    "latency_ms": item.latency_ms,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
            )
        return {"total": total, "page": page, "page_size": page_size, "items": records}


mcp_service = MCPService()
