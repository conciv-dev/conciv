---
'@conciv/core': patch
---

Session state is now enforced through an ambient `SessionScope` facade (Node `AsyncLocalStorage`) instead of hand-threaded session ids: core, harness, tools, and the CLI resolve their session from context, and the raw page-bus/tool-registry/ask/stream primitives are no longer exported outside the facade. RPC, MCP, and extension boundaries mint or resolve a real session per request rather than falling back to `?? ''` sentinels, and the widget now carries its session id on every RPC call, with the page plane binding only once a session is resolved. The `@conciv/extension` public API loses its ambient `ServerToolCaller`/`ServerPageCaller` surfaces in favor of a per-request `SessionScope`, and `page.changes` persists per session. Whiteboard and terminal server routes verify the session/room a request claims to belong to before mutating it.
