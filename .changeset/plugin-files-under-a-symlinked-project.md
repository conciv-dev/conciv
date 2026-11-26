---
'@conciv/backend-app-api': patch
---

A project opened through a symlinked path (for example a folder under /tmp or /var on macOS, or a symlinked checkout) now picks up every plugin file you add to its conciv folder. Before, only the first file was picked up, and later files stayed invisible until a restart.
