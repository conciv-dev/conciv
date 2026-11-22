---
'@conciv/app': patch
'@conciv/embed': patch
---

The standalone conciv app renders again in a browser without IndexedDB: the draft store is opened through one shared `openBrowserDraftStore`, which logs "drafts stay engine-only" and runs without local drafts, as the embedded widget already did. `@conciv/app` exports `openBrowserDraftStore` in place of `createBrowserDraftStore`.
