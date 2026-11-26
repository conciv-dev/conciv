---
'@conciv/backend': patch
---

When the engine fails partway through starting, it closes the database and the plugin host it had already opened instead of leaving them open.
