---
'@conciv/app': patch
'@conciv/embed': patch
'@conciv/ui-kit-system': patch
---

The composer's slash list shows plugin commands that carry a `slash` name, in plugin order and honouring `slash.after`; picking one runs it, and a command that throws is logged under its plugin's id.

The anchored list behind the composer's slash and mention lists opens above its anchor, flipping below only when there is no room, and scrolls inside the space left on screen so every entry and the highlighted one stay in view.
