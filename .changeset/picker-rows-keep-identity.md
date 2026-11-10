---
'@conciv/ui-kit-system': patch
'@conciv/embed': patch
---

Session picker rows stay mounted when the session list refetches the same sessions, so a hovered title keeps its tooltip and a row's "Copied" feedback survives a search refresh. Row titles share one tooltip for the whole list instead of one tooltip per row.
