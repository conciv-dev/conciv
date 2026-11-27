# backend-defaults/src/engine/api

## Purpose

The engine's HTTP surface besides the login: the MCP endpoint that serves the sandboxed TypeScript runner (`mcp.ts`), the widget host page (`widget-page.ts`), the reading of a call's origin (`call-trace.ts`), and the oRPC router ([./rpc/README.md](./rpc/README.md)).

## Invariants

- `/api/mcp` and the RPC `code.*` procedures run the same `openCodeSession` (`mcp.ts`), so a block runs, is capped and is mirrored into the session's chat the same way on both. Its result lists the run's capability call ids (`calls`); it knows nothing of page queues: the hub asks the page plugin for those itself, through `plugin.invoke`.
- A present but invalid session header is an HTTP 400.
- The MCP endpoint answers 403 'forbidden host' when the host is not a loopback name (DNS rebinding protection); auth stays with the engine gate.
- Every hub-origin call is refused first when the calling agent is disconnected; an outside run (hub origin, no session header) gets every capability that is not a direct plugin tool answering `ai.NO_TAB`.
- A sandbox result that fails `ExecuteResultSchema` becomes 'the sandbox returned an unreadable result'; error codes are decoded only when the run declared them.
- The widget page serves only the bundle file and chunk names matching its schema.
