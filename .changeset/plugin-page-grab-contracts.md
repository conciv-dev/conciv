---
'@conciv/plugin': patch
'@conciv/grab': patch
'@conciv/page': patch
---

`@conciv/plugin` gains two browser subpaths: `@conciv/plugin/experimental/page` declares the `Page` contract (`symbolicate`, `toast`, `capture` with `exclude` and `plugins`, a list of snapdom plugins typed by `@zumer/snapdom`'s own `SnapdomPlugin`, so `@conciv/plugin` now depends on `@zumer/snapdom`), the `ReactTree` contract (`rootFibers`, `dehydrate`, `describe`, `locate`, `frames`) and the `PageEffect` registry; `@conciv/plugin/experimental/grab` declares the `GrabApi` contract (`pick`, `comment`, `grabbable`, `stage`, `staged`, `clear`) and the `GrabPicker` registry. A plugin's browser bundle may require both. The element grab types (`ElementSource`, `ElementRect`, `Grab`, `GrabPreview`, `DomPreview`, `ImagePreview`, `GrabFrame`) now live in `@conciv/plugin/experimental/grab` and `@conciv/grab` re-exports them; `DehydrateOptions` lives in `@conciv/plugin/experimental/page` and `@conciv/page` re-exports it.
