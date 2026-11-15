---
'@conciv/unplugin': patch
---

Closing the dev server now waits for the conciv engine to stop: Vite's `server.close()` and a webpack or rspack `compiler.close()` settle only after the engine has released its port and shut down.
