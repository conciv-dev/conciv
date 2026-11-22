---
'@conciv/core': patch
---

The value `start()` returns, and `makeApp`'s result, carry the engine's oRPC router under a private, non-enumerable key, so core's own tests call procedures the oRPC way. The public `Engine` and `MadeApp` types gain only an opaque `EngineRouterBrand`; nothing a consumer can import or read.
