---
'@conciv/core': patch
'@conciv/unplugin': patch
'@conciv/try': patch
'@conciv/plugin-testkit': patch
---

The engine takes a `log` option (`{level, emit}`, as opencode's SDK): `start` and `makeApp` route every Effect log of the engine and its plugins to `emit`. Without it, nothing is logged. The engine logs a start line once its plugins are supervised.

The engine no longer writes to the console: every line it used to print (errors, the browser login code, the "port in use" notice) is an Effect log with its values as annotations, and the `print` option is gone. The Vite plugin, the other unplugin hosts and `@conciv/try` show the same lines as before: the login code banner, and warnings and errors as their message plus the error; other entries, such as the plugin host's file watcher lines, are not printed.
