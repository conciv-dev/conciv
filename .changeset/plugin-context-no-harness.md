---
'@conciv/backend-plugin-api': patch
---

Plugins no longer get `ctx.harness` or `ctx.bundler`; nothing reads the harness, and the dev server's diagnostics arrive as `bundler.diagnostic` engine events through `ctx.event.subscribe`. `BundlerBridge` and `defineBundlerBridge` move from `@conciv/types/bundler-types` to `@conciv/protocol/schema/bundler`, beside the diagnostic schema, and `BundlerDiagnostic` is gone: use `Diagnostic` from the same module.
