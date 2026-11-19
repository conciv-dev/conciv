---
'@conciv/harness-testkit': patch
---

`serveExtensionRpc` is gone from `@conciv/harness-testkit/rpc-mounts`; serve a router with `serveRpcRouter`, and the testkit no longer depends on `@conciv/extension`.
