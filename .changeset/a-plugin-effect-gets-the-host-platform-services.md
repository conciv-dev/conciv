---
'@conciv/plugin': patch
'@conciv/plugin-host': patch
---

The host gives a plugin's Effect FileSystem, Path and ChildProcessSpawner. An external plugin may require only those services plus Scope; the SDK exports them as `Services`.
