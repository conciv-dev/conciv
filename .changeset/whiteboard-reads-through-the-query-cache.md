---
'@conciv/plugin-whiteboard': patch
---

The whiteboard loads its canvas through the app's query cache, and opening it again after a failed load tries once more. The collections that talk to the engine live in their own model file.
