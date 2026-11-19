---
'@conciv/plugin-internal': patch
---

A first-party plugin's published types name only the public plugin definition: `defineInternalPlugin` returns the same type as `Plugin.define`, and the internal stamp stays a runtime fact the host reads.
