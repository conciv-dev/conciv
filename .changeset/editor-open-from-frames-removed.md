---
'@conciv/protocol': patch
'@conciv/backend': patch
'@conciv/backend-plugin-api': patch
'@conciv/types': patch
---

The engine no longer serves `editor.openFromFrames`, and the SDK client no longer has an `editor` group: nothing called it, and opening a grabbed element's source goes through the page plugin.
