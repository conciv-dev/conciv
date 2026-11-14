---
'@conciv/plugin-host': patch
'@conciv/core': patch
---

Images in a plugin tool's result are resized to fit the model's limits (2000 by 2000 pixels, 5 MB), re-encoded as JPEG when that is smaller, or dropped with a note when they cannot be read or made to fit.
