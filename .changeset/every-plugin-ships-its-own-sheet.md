---
'@conciv/app': patch
'@conciv/plugin-page': patch
'@conciv/plugin-ios': patch
---

The page, terminal and iOS plugins now ship their own stylesheet, as every other plugin does, and the widget's stylesheet no longer reads any plugin's source.
