---
'@conciv/app': patch
'@conciv/embed': patch
---

A draft that was never saved to the engine is gone when this browser is logged out of the engine or its access is revoked: the widget empties its local draft store (`conciv-drafts`) at that moment.

Text typed and reloaded at once comes back even when its last save was still being written as the page went: leaving the page writes that save again, and every draft change is written to this browser at once, with no 100 ms batch.
