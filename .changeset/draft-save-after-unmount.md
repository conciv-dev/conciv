---
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

A draft save that starts after the app is torn down no longer runs against the closed engine connection, so unmounting the widget with a draft still to save logs no error; the device draft copy keeps the text for the next load.
