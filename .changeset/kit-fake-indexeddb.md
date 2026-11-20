---
'@conciv/plugin-testkit': patch
---

The happy-dom setup gives every test an in-memory IndexedDB (fake-indexeddb), fresh for each `mount`, so the app keeps its device copy of drafts there instead of logging that drafts stay engine-only.
