---
'@conciv/solid-diffs': patch
'@conciv/ui-kit-chat': patch
---

Prime the diffs highlight worker pool when the thread mounts. Until the pool finished
initialising, `File` had no plain-text AST to paint, so the first code surface of a run
appeared empty and then jumped to its real height, shifting every trace row below it.
