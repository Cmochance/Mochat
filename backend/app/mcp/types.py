from dataclasses import dataclass
from typing import Any


@dataclass
class MCPResolvedTool:
    server_id: int
    server_name: str
    transport: str
    name: str
    alias: str
    description: str
    input_schema: dict[str, Any]
    requires_approval: bool
    timeout_ms: int
    retry_count: int


@dataclass
class MCPPlannedCall:
    alias: str
    arguments: dict[str, Any]
    reason: str = ""

