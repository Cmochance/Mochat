import unittest
from types import SimpleNamespace

from backend.app.mcp.service import MCPService
from backend.app.mcp.types import MCPPlannedCall, MCPResolvedTool


class MCPServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.service = MCPService()

    def _tool(self, *, requires_approval: bool = False) -> MCPResolvedTool:
        return MCPResolvedTool(
            server_id=1,
            server_name="demo",
            transport="remote",
            name="search",
            alias="mcp_1_search",
            description="demo tool",
            input_schema={
                "type": "object",
                "properties": {
                    "q": {"type": "string"},
                    "limit": {"type": "integer"},
                },
                "required": ["q"],
                "additionalProperties": False,
            },
            requires_approval=requires_approval,
            timeout_ms=15000,
            retry_count=1,
        )

    def test_sanitize_for_log_masks_sensitive_values(self) -> None:
        data = {
            "Authorization": "Bearer secret-token",
            "nested": {"api_key": "123", "ok": "value"},
        }
        sanitized = self.service._sanitize_for_log(data)
        self.assertEqual(sanitized["Authorization"], "***")
        self.assertEqual(sanitized["nested"]["api_key"], "***")
        self.assertEqual(sanitized["nested"]["ok"], "value")

    def test_validate_arguments_rejects_unknown_fields(self) -> None:
        tool = self._tool()
        with self.assertRaises(RuntimeError):
            self.service._validate_arguments(tool, {"q": "hello", "unknown": "x"})

    def test_validate_arguments_accepts_valid_payload(self) -> None:
        tool = self._tool()
        validated = self.service._validate_arguments(tool, {"q": "hello", "limit": 3})
        self.assertEqual(validated["q"], "hello")
        self.assertEqual(validated["limit"], 3)

    async def test_execute_calls_pauses_for_approval(self) -> None:
        tool = self._tool(requires_approval=True)
        planned = [MCPPlannedCall(alias=tool.alias, arguments={"q": "hello"}, reason="test")]
        alias_map = {tool.alias: tool}

        async def fake_create_approval(*args, **kwargs):
            return SimpleNamespace(id=123), {
                "approval_id": 123,
                "server_name": "demo",
                "tool_name": "search",
                "arguments": {"q": "hello"},
            }

        async def fake_log_run(*args, **kwargs):
            return None

        self.service._create_approval = fake_create_approval  # type: ignore[method-assign]
        self.service._log_run = fake_log_run  # type: ignore[method-assign]

        result = await self.service._execute_calls(
            db=None,  # type: ignore[arg-type]
            request_id="req-1",
            session_id=1,
            user=SimpleNamespace(id=1),
            model=None,
            mcp_mode="auto",
            planned_calls=planned,
            alias_map=alias_map,
            events=[],
            seed_tool_messages=[],
            transport_cache={},
        )
        self.assertIsNotNone(result.get("approval"))
        self.assertEqual(result.get("approval_event", {}).get("approval_id"), 123)


if __name__ == "__main__":
    unittest.main()
