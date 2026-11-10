---
'@conciv/embed': patch
---

The widget's utility CSS is generated once per build, so every build carries the full rule set. Before, two compiles of the same stylesheet could run at once and drop the utilities of whole source files (for example the session card's status dots and the whiteboard pin badge).
