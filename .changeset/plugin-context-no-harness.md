---
'@conciv/plugin': patch
---

Plugins no longer get `ctx.harness` or `ctx.bundler`; nothing reads the harness, and the dev server's diagnostics arrive as `bundler.diagnostic` engine events through `ctx.event.subscribe`.
