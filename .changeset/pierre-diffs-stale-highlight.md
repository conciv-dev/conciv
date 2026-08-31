---
'@conciv/solid-diffs': patch
---

Patch @pierre/diffs 1.3.6 so a highlight that lands for a superseded file no longer overwrites the current render cache. Backports the guard from upstream's `applyHighlightResult`: the renderer now tracks the file it was last asked to render and drops highlight results for anything else, which stops streaming code bodies from visibly shrinking back to an earlier snapshot under load.
