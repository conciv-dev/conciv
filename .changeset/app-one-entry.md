---
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

The app has one entry, `ConcivApp` over a `Platform`; the embed page host, the native host, the dev server and the app tests render it instead of rebuilding the boot.
