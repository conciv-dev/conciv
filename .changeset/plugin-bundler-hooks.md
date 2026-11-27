---
'@conciv/backend-plugin-api': patch
'@conciv/unplugin': patch
---

A plugin definition can carry an optional `bundler` part with `transform`, `resolveId` and `load`. In dev, the engine hands the loaded plugins' bundler parts to `@conciv/unplugin`, which runs them after its own source stamp, in plugin load order.
