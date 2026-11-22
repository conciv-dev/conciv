---
'@conciv/unplugin': patch
---

The Vite dev server warms only the mount chunk that the embed's mount.js imports, so a stale chunk left in the embed dist is no longer warmed or transformed.
