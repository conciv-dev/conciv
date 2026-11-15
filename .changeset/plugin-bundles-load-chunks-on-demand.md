---
'@conciv/plugin': patch
'@conciv/plugin-host': patch
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/app': patch
---

`experimental()` no longer inlines a plugin's dynamic `import()`: the build writes a CommonJS entry, one `.cjs` chunk per `import()` and Vite's manifest beside the entry (`plugin-experimental.cjs.manifest.json`).

The app loads a plugin's entry with the chunks it requires at start (`plugin.experimental` now answers them as `chunks`) and each `import()`ed chunk on demand over the engine socket, through the new `plugin.experimentalChunk` procedure. The engine serves only the files the plugin's manifest lists, and refuses with `PLUGIN_CHUNK_NOT_FOUND` a file the manifest does not list or whose bytes changed since the plugin loaded.
