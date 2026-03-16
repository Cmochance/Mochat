# Mochat Local MCP Integration Review

Inspection date: 2026-03-16

## Repository state at inspection time

- Base branch checked: `main`
- Local `main` commit: `4f042d8` (`fix: align hero CTA route and title size`)
- Remote `origin/main` commit after fetch: `4f042d8`
- Local commits ahead of remote: `0`
- Local commits behind remote: `0`

## Local unpushed work found

The local repository contains substantial uncommitted work focused on MCP integration across backend, frontend, configuration, and tests.

### Backend scope

- Adds `backend/app/mcp/` orchestration code for remote and stdio MCP transports
- Extends admin APIs with MCP server CRUD, tool sync, resource browsing, prompt inspection, and run-log access
- Extends chat APIs with MCP server listing, per-user MCP connection management, and approval endpoints
- Adds MCP-related data models and CRUD for servers, secrets, tool cache, run logs, approvals, and user connections
- Adds MCP settings in application config and environment examples
- Connects chat streaming flow to MCP planning, tool execution, and approval handling

### Frontend scope

- Adds MCP configuration tab in admin UI
- Adds MCP server CRUD and tool management client methods
- Extends chat page with MCP enablement, mode selection, server selection, connection management, timeline display, and approval modal
- Extends frontend chat/admin types for MCP payloads
- Adds Playwright setup and a basic MCP flow spec

### Supporting config and docs

- Updates `README.md`, `.env.example`, and `docker-compose.yml` for MCP-related options

## Items intentionally excluded from the preservation branch

- `.external/stitch-game-cover-pipeline-skill/`

Reason:

- It is an untracked nested external repository rather than project source
- Repository search found no direct runtime references from Mochat code to this path
- Pushing the nested repo into Mochat would pollute project history and mix external material with project code

Also excluded:

- Generated `__pycache__` content under new Python directories

## Preservation action

- Preservation branch: `chore/preserve-local-mcp-integration`
- This branch preserves the local MCP-related project code and this audit note
