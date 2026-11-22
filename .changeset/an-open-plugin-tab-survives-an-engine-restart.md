---
'@conciv/core': patch
'@conciv/embed': patch
---

The engine answers its plugin list once its plugins are active, so a widget that reconnects while the engine is still starting keeps its open plugin tab instead of reading an empty list and falling back to Chat.
