---
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/plugin': patch
'@conciv/protocol': patch
---

The engine no longer serves `editor.openFromFrames`, and the SDK client no longer has an `editor` group: nothing called it, and opening a grabbed element's source goes through the page plugin.
