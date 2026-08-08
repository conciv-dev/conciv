---
'@conciv/core': patch
---

Serve one composite oRPC router (core procedures plus `ext.<slug>` extension routers) over both a fetch mount at `/rpc` and a new additive WebSocket mount at `/rpc-ws`. Per-call request headers are now derived from the oRPC standard request by a single shared root interceptor, so session-scoped calls behave identically on both transports. `@conciv/serve` gains an explicit `maxPayload`, a graceful socket close that only terminates after a deadline, and a `fetch` type that accepts the server env argument. Existing `/rpc` and `/rpc/ext/<slug>` URLs are unchanged.
