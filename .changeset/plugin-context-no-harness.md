---
'@conciv/plugin': patch
---

Plugins no longer get `ctx.harness` or `ctx.bundler`; nothing reads the harness, and the dev server's diagnostics arrive as `bundler.diagnostic` engine events through `ctx.event.subscribe`. `BundlerBridge` and `defineBundlerBridge` move from `@conciv/protocol/bundler-types` to `@conciv/plugin/schema/bundler`, beside the diagnostic schema, and `BundlerDiagnostic` is gone: use `Diagnostic` from the same module.
