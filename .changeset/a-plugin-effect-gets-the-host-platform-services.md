---
'@conciv/plugin': patch
'@conciv/plugin-host': patch
---

The host gives a plugin's Effect FileSystem, Path and ChildProcessSpawner. An external plugin may require only those services plus Scope; the SDK exports them as `Services`.

A plugin's Effect may fail with a tagged error (the SDK exports the bound as `TaggedError`); the host shows the plugin as `failed to load plugin: <tag>: <message>` and keeps the other plugins running.
