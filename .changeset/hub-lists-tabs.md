---
'@conciv/cli': patch
'@conciv/backend': patch
---

The conciv MCP hub (`conciv mcp serve`) serves a third tool, `list_tabs`: it lists the open conciv tabs of every running dev server on the machine, with the same rows as before (project, branch, root, href, pageTitle, sessionTitle, lastActive, running, state, harness, browserTabs) and every dev server that did not answer under `unreachable`. An outside agent calls it first, then passes a tab's id as `tab` on `execute_typescript` and `discover_tools`. `conciv tools tabs` prints the same listing and no longer goes through a tab, so it never asks for an Allow.

Removed: the engine's `tabs` tool, so `external_tabs({})` no longer exists in code mode (in the tab or in an outside run); use the hub's `list_tabs`, or `conciv tools tabs` in a terminal. An outside run's `NO_TAB` error and the hub's `TAB_NOT_OPEN` reply now name `list_tabs`. The `@conciv/tools/builtins` export is removed, with `BUILTIN_TABS_TOOL`, `TabsToolContext`, `BuiltinCategory` and `builtinToolNames()`; it held nothing else once `server_reload` was removed.
