---
'@conciv/unplugin': patch
---

Ctrl+C on a Vite dev server with conciv now runs Vite's own close, so the engine stops cleanly: a live run's adapter files are removed and its agent CLI is stopped. The close is bounded as in opencode: after 10 seconds, or on a second Ctrl+C, it prints what is still pending and exits 1.
