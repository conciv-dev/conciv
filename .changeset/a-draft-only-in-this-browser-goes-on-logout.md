---
'@conciv/app': patch
'@conciv/embed': patch
---

A draft that was never saved to the engine is gone when this browser is logged out of the engine or its access is revoked: the widget empties its local draft store (`conciv-drafts`) at that moment.
