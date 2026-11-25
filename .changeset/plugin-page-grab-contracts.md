---
'@conciv/backend-plugin-api': patch
'@conciv/grab': patch
'@conciv/plugin-page': patch
---

`@conciv/backend-plugin-api` gains two browser subpaths: `@conciv/frontend-plugin-api/page` declares the `Page` contract (`symbolicate`, `toast`, `capture` with `exclude` and `plugins`, a list of snapdom plugins typed by `@zumer/snapdom`'s own `SnapdomPlugin`, so `@conciv/backend-plugin-api` now depends on `@zumer/snapdom`), the `ReactTree` contract (`rootFibers`, `dehydrate`, `describe`, `locate`, `frames`) and the `PageEffect` registry; `@conciv/frontend-plugin-api/grab` declares the `GrabApi` contract (`pick`, `comment`, `grabbable`, `stage`, `staged`, `clear`) and the `GrabPicker` registry. A plugin's browser bundle may require both. The element grab types (`ElementSource`, `ElementRect`, `Grab`, `GrabPreview`, `DomPreview`, `ImagePreview`, `GrabFrame`) now live in `@conciv/frontend-plugin-api/grab` and `@conciv/grab` re-exports them; `DehydrateOptions` lives in `@conciv/frontend-plugin-api/page` and `@conciv/page` re-exports it.
