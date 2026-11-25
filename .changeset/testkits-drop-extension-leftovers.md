---
'@conciv/simulation': patch
---

`serveExtensionRpc` is gone from `@conciv/simulation/rpc-mounts`; serve a router with `serveRpcRouter`, and the testkit no longer depends on `@conciv/extension`.
