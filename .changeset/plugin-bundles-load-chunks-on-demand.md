---
'@conciv/backend-plugin-api': patch
'@conciv/backend-app-api': patch
'@conciv/protocol': patch
'@conciv/backend': patch
'@internal/frontend-defaults': patch
---

`experimental()` no longer inlines a plugin's dynamic `import()`: the build writes a CommonJS entry, one `.cjs` chunk per `import()` and Vite's manifest beside the entry (`plugin-experimental.cjs.manifest.json`).

The app loads a plugin's entry with the chunks it requires at start (`plugin.experimental` now answers them as `chunks`) and each `import()`ed chunk on demand over the engine socket, through the new `plugin.experimentalChunk` procedure. The engine serves only the files the plugin's manifest lists, and refuses with `PLUGIN_CHUNK_NOT_FOUND` a file the manifest does not list or whose bytes changed since the plugin loaded.

A lazy chunk may require the plugin's entry, as Vite writes when the lazy part imports a value the entry exports: `plugin.experimental` also answers the entry's file name as `file`, `BridgePluginExperimental` carries it, and `evaluatePluginBundle`'s `PluginBundle` carries the entry's `exports`, which the app gives a chunk that requires `./<file>`. Both fields are additive. The engine leaves the entry out of a chunk's closure instead of refusing the manifest.
