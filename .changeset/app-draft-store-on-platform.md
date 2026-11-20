---
'@conciv/embed': patch
---

The app takes its draft store from the platform (`Platform.draftStore`). The embed passes the browser's IndexedDB store; a platform without one keeps drafts on the engine only.
