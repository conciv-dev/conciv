---
'@conciv/plugin': patch
'@conciv/plugin-host': patch
---

A plugin's Effect can use FileSystem, Path and ChildProcessSpawner from the host. The requirements of `Plugin` and `define` are bounded by the exported `Services`.
