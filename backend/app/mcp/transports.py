import asyncio
import json
import os
import random
import time
import uuid
from typing import Any

import httpx


class MCPTransportError(RuntimeError):
    pass


class MCPRemoteTransport:
    _client_lock = asyncio.Lock()
    _clients: dict[str, httpx.AsyncClient] = {}
    _circuit_states: dict[str, dict[str, Any]] = {}

    def __init__(
        self,
        base_url: str,
        headers: dict[str, str] | None = None,
        timeout_ms: int = 15000,
        retry_count: int = 1,
        backoff_ms: int = 200,
        circuit_failure_threshold: int = 3,
        circuit_cooldown_seconds: int = 30,
    ):
        self.base_url = base_url.rstrip("/")
        self.headers = headers or {}
        self.timeout = max(1, timeout_ms) / 1000
        self.retry_count = max(0, retry_count)
        self.backoff_ms = max(50, backoff_ms)
        self.circuit_failure_threshold = max(1, circuit_failure_threshold)
        self.circuit_cooldown_seconds = max(1, circuit_cooldown_seconds)
        self._initialized = False

    def _client_key(self) -> str:
        return f"{self.base_url}|{self.timeout}"

    async def _get_client(self) -> httpx.AsyncClient:
        key = self._client_key()
        client = self._clients.get(key)
        if client:
            return client
        async with self._client_lock:
            client = self._clients.get(key)
            if client:
                return client
            client = httpx.AsyncClient(timeout=self.timeout)
            self._clients[key] = client
            return client

    def _check_circuit(self) -> None:
        state = self._circuit_states.get(self.base_url)
        if not state:
            return
        open_until = float(state.get("open_until", 0) or 0)
        if open_until and open_until > time.time():
            raise MCPTransportError("MCP remote circuit open, retry later")

    def _record_success(self) -> None:
        self._circuit_states.pop(self.base_url, None)

    def _record_failure(self) -> None:
        now = time.time()
        state = self._circuit_states.get(self.base_url, {"failures": 0, "open_until": 0.0})
        failures = int(state.get("failures", 0)) + 1
        open_until = 0.0
        if failures >= self.circuit_failure_threshold:
            open_until = now + self.circuit_cooldown_seconds
        self._circuit_states[self.base_url] = {"failures": failures, "open_until": open_until}

    async def _rpc_notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
        }
        try:
            client = await self._get_client()
            response = await client.post(self.base_url, json=payload, headers=self.headers)
            response.raise_for_status()
        except Exception:
            # 通知失败不影响主流程
            return

    async def _rpc_request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": method,
            "params": params or {},
        }

        last_error: Exception | None = None
        for attempt in range(self.retry_count + 1):
            try:
                self._check_circuit()
                client = await self._get_client()
                response = await client.post(self.base_url, json=payload, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list) and data:
                    data = data[0]
                if "error" in data:
                    message = data.get("error", {}).get("message", "MCP remote error")
                    raise MCPTransportError(message)
                self._record_success()
                return data.get("result", {}) if isinstance(data, dict) else {}
            except Exception as exc:  # noqa: PERF203
                last_error = exc
                self._record_failure()
                if attempt < self.retry_count:
                    backoff = min((self.backoff_ms / 1000) * (2**attempt), 2.5)
                    await asyncio.sleep(backoff + random.uniform(0, 0.12))
        raise MCPTransportError(f"Remote MCP request failed: {last_error}")

    async def initialize(self) -> dict[str, Any]:
        if self._initialized:
            return {}
        result = await self._rpc_request(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "Mochat", "version": "1.0.0"},
            },
        )
        await self._rpc_notify("notifications/initialized", {})
        self._initialized = True
        return result

    async def list_tools(self) -> list[dict[str, Any]]:
        await self.initialize()
        result = await self._rpc_request("tools/list", {})
        tools = result.get("tools", [])
        return tools if isinstance(tools, list) else []

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        await self.initialize()
        result = await self._rpc_request("tools/call", {"name": name, "arguments": arguments})
        return result if isinstance(result, dict) else {"result": result}

    async def list_resources(self) -> list[dict[str, Any]]:
        await self.initialize()
        result = await self._rpc_request("resources/list", {})
        resources = result.get("resources", [])
        return resources if isinstance(resources, list) else []

    async def read_resource(self, uri: str) -> dict[str, Any]:
        await self.initialize()
        result = await self._rpc_request("resources/read", {"uri": uri})
        return result if isinstance(result, dict) else {"result": result}

    async def list_prompts(self) -> list[dict[str, Any]]:
        await self.initialize()
        result = await self._rpc_request("prompts/list", {})
        prompts = result.get("prompts", [])
        return prompts if isinstance(prompts, list) else []

    async def get_prompt(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        await self.initialize()
        result = await self._rpc_request("prompts/get", {"name": name, "arguments": arguments or {}})
        return result if isinstance(result, dict) else {"result": result}


class MCPStdioTransport:
    def __init__(
        self,
        command: str,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
        timeout_ms: int = 15000,
        retry_count: int = 1,
        backoff_ms: int = 200,
    ):
        self.command = command
        self.args = args or []
        self.env = env or {}
        self.timeout = max(1, timeout_ms) / 1000
        self.retry_count = max(0, retry_count)
        self.backoff_ms = max(50, backoff_ms)

    async def _send_json(self, proc: asyncio.subprocess.Process, payload: dict[str, Any]) -> None:
        if not proc.stdin:
            raise MCPTransportError("MCP stdio stdin unavailable")
        proc.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
        await proc.stdin.drain()

    async def _read_json_response(self, proc: asyncio.subprocess.Process, expected_id: str) -> dict[str, Any]:
        if not proc.stdout:
            raise MCPTransportError("MCP stdio stdout unavailable")

        while True:
            line = await asyncio.wait_for(proc.stdout.readline(), timeout=self.timeout)
            if not line:
                break
            text = line.decode("utf-8", errors="ignore").strip()
            if not text:
                continue
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                continue
            if str(payload.get("id")) != expected_id:
                continue
            if "error" in payload:
                message = payload.get("error", {}).get("message", "MCP stdio error")
                raise MCPTransportError(message)
            return payload.get("result", {})
        raise MCPTransportError("MCP stdio response not found")

    async def _rpc_once(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        env = os.environ.copy()
        env.update({k: str(v) for k, v in self.env.items()})
        proc = await asyncio.create_subprocess_exec(
            self.command,
            *self.args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        init_id = str(uuid.uuid4())
        req_id = str(uuid.uuid4())
        try:
            await self._send_json(
                proc,
                {
                    "jsonrpc": "2.0",
                    "id": init_id,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "Mochat", "version": "1.0.0"},
                    },
                },
            )
            await self._read_json_response(proc, init_id)

            # MCP 规范建议 initialize 后发送 initialized 通知。
            await self._send_json(
                proc,
                {
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                    "params": {},
                },
            )

            await self._send_json(
                proc,
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "method": method,
                    "params": params or {},
                },
            )
            return await self._read_json_response(proc, req_id)
        finally:
            if proc.returncode is None:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=1.5)
                except Exception:
                    proc.kill()

    async def _rpc(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(self.retry_count + 1):
            try:
                return await self._rpc_once(method, params)
            except Exception as exc:  # noqa: PERF203
                last_error = exc
                if attempt < self.retry_count:
                    backoff = min((self.backoff_ms / 1000) * (2**attempt), 2.5)
                    await asyncio.sleep(backoff + random.uniform(0, 0.12))
        raise MCPTransportError(f"MCP stdio request failed: {last_error}")

    async def list_tools(self) -> list[dict[str, Any]]:
        result = await self._rpc("tools/list", {})
        tools = result.get("tools", [])
        return tools if isinstance(tools, list) else []

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = await self._rpc("tools/call", {"name": name, "arguments": arguments})
        return result if isinstance(result, dict) else {"result": result}

    async def list_resources(self) -> list[dict[str, Any]]:
        result = await self._rpc("resources/list", {})
        resources = result.get("resources", [])
        return resources if isinstance(resources, list) else []

    async def read_resource(self, uri: str) -> dict[str, Any]:
        result = await self._rpc("resources/read", {"uri": uri})
        return result if isinstance(result, dict) else {"result": result}

    async def list_prompts(self) -> list[dict[str, Any]]:
        result = await self._rpc("prompts/list", {})
        prompts = result.get("prompts", [])
        return prompts if isinstance(prompts, list) else []

    async def get_prompt(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        result = await self._rpc("prompts/get", {"name": name, "arguments": arguments or {}})
        return result if isinstance(result, dict) else {"result": result}
