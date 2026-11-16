---
'@conciv/unplugin': patch
---

When the conciv state folder cannot be created (for example `stateRoot` points at a file, or a folder you cannot write to), the webpack or Rspack watcher no longer fails. It keeps running without an engine and prints `conciv: the engine failed to start` with the reason.
