---
'@conciv/plugin': patch
---

The widget now mounts in Vite hosts that install conciv from npm, without the host listing `lru_map` or `partial-json` in `optimizeDeps.include`.
