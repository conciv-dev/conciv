---
'@conciv/unplugin': patch
---

The webpack and Rspack plugins start the conciv engine only while the bundler watches (`webpack serve`, `rspack dev`, `--watch`). A production build (`webpack --mode production`, `rspack build`) no longer starts an engine or writes a new token to `.conciv/server.json`, and it exits once it has compiled. Closing the watcher stops the engine.

When the `port` you set in `conciv({port})` is already taken, the webpack or Rspack dev server no longer crashes with `Error: listen EADDRINUSE`. It keeps running without an engine and prints one line: `conciv: port <port> is already in use, the engine did not start. Free the port or pass another port to conciv()`.
