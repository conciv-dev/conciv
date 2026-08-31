---
'@conciv/solid-diffs': patch
---

Upgrade `@pierre/diffs` to 1.3.6. The 1.3 line adds an opt-in editor entry point,
partial-diff hydration and CodeView header/footer regions; none of that changes
how the read-only `File` / `FileDiff` surfaces we wrap behave. The published
browser floor rises to Firefox 125+.
