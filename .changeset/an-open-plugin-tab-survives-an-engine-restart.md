---
'@conciv/core': patch
'@conciv/embed': patch
---

A plugin tab stays open through an engine restart. Before, the widget reconnected while the engine was still starting its plugins, read an empty plugin list and sent the user back to Chat; the engine now answers its plugin list once its plugins are active.
