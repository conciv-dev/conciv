---
'@conciv/app': patch
'@conciv/embed': patch
'@conciv/plugin-testkit': patch
---

`Platform.draftStore` is a factory, `(writable) => DraftStore | undefined`, which the app calls with its trust check. The browser store asks that check before each IndexedDB write transaction again, so a draft save that started while the engine trusted this browser and ran past a revoke no longer lands after the store is cleared.
