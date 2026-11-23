---
'@conciv/plugin-tanstack': patch
'@conciv/embed': patch
---

The widget names no plugin's tools: a plugin's tool cards draw their own titles and icons, and the tanstack plugin registers its own error card for a failed call, as the page plugin does. The widget's tool catalog reads only what the engine reports.
