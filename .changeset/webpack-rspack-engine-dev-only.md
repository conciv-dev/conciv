---
'@conciv/unplugin': patch
---

The webpack and Rspack plugins start the conciv engine only while the bundler watches (`webpack serve`, `rspack dev`, `--watch`). A production build (`webpack --mode production`, `rspack build`) no longer starts an engine or writes a new token to `.conciv/server.json`, and it exits once it has compiled. Closing the watcher stops the engine.
