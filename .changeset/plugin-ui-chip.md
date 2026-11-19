---
'@conciv/plugin': patch
'@conciv/app': patch
'@conciv/ui-kit-chat': patch
---

Plugins render the kit's chip through `ctx.ui.Chip`: a short label in a pill, with a tone and an optional tooltip. A chip with a tooltip whose value is cut shows the full value above the tooltip text.
