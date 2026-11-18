---
'@conciv/app': patch
'@conciv/embed': patch
---

The composer's slash list shows plugin commands that carry a `slash` name, in plugin order and honouring `slash.after`; picking one runs it, and a command that throws is logged under its plugin's id.
