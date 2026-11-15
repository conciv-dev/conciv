---
'@conciv/unplugin': patch
'@conciv/cli': patch
'@conciv/it': patch
---

The webpack and Rspack plugins start the conciv engine only while the bundler watches (`webpack serve`, `rspack dev`, `--watch`). A production build (`webpack --mode production`, `rspack build`) no longer starts an engine or writes a new token to `.conciv/server.json`, and it exits once it has compiled. Closing the watcher stops the engine.

When the `port` you set in `conciv({port})` is already taken, the webpack or Rspack dev server no longer crashes with `Error: listen EADDRINUSE`. It keeps running without an engine and prints one line: `conciv: port <port> is already in use, the engine did not start. Free the port or pass another port to conciv()`.

A CommonJS webpack or Rspack config can now load the plugin: `require('@conciv/it/plugin/webpack')` (or `/plugin/rspack`) with `conciv.default()` used to fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which broke the configs `conciv init` writes for CommonJS projects.

`conciv init` on a webpack or Rspack project no longer tells you to serve `@conciv/widget/global` and set `widgetUrl`; neither exists. Its card now says what is true today: the integration starts the engine but does not add the widget to your page, with a link to https://conciv.dev/docs/quick-start/webpack (or `/rspack`).
