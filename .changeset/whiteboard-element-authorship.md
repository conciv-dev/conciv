---
'@conciv/extension-whiteboard': patch
---

Canvas elements now record their author (owner + lastEditedBy, human vs AI). The AI asks for approval before modifying or deleting a human-drawn element, and a chip on the selected element shows who drew it.
