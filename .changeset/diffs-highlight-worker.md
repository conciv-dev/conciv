---
'@conciv/solid-diffs': patch
'@conciv/embed': patch
---

Highlight tool-result code and diffs in a worker pool instead of on the main thread. `SolidCodeBlock`, `SolidFileDiff` and `SolidPatchDiff` now hand `@pierre/diffs` a shared worker pool built from its portable worker entry, so that grammar compilation and tokenization run off the main thread while the block keeps rendering plain text until the highlighted result arrives.
