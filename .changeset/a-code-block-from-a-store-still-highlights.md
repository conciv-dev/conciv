---
'@conciv/solid-diffs': patch
---

`SolidCodeBlock` unwraps a file held in a Solid store before handing it to the highlight worker, so a store-held file is highlighted instead of failing with `DataCloneError` and rendering as plain text.
