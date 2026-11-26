---
'@internal/frontend-defaults': patch
'@conciv/app': patch
'@conciv/ui-kit-system': patch
---

The composer's slash list shows plugin commands that carry a `slash` name, in plugin order and honouring `slash.after`, chained ones included. The first command in plugin order owns a name, over a later plugin and over a harness command of that name, and the list and typed text run that same command, which gets the typed text only when it declares `arguments`; picking one runs it, and a command that throws is logged under its plugin's id.

The anchored list behind the composer's slash and mention lists opens above its anchor, flipping below only when there is no room, and scrolls inside the space left on screen so every entry and the highlighted one stay in view.
