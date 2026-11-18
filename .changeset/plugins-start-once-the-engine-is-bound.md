---
'@conciv/embed': patch
---

A widget that boots before it knows its engine (the try-it connect flow) now starts its plugins once the engine is found, so the built-in panels, the Terminal among them, appear after the hand-off. The plugins also follow the engine when the widget is pointed at another one.
