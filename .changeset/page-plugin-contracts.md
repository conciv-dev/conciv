---
'@conciv/backend-plugin-api': patch
'@conciv/plugin-page': patch
'@conciv/backend': patch
'@internal/frontend-defaults': patch
'@conciv/backend-app-api': patch
---

Plugins can now use the page through two contracts from `@conciv/frontend-plugin-api/page`: `Page` (find the source line behind stack frames, show a toast on the page, and the settings a page capture needs) and `ReactTree` (read the React tree behind an element). conciv's built-in page plugin provides both in the widget. The new package `@conciv/plugin-page` is the page plugin's engine half: the engine runs it, and it answers its `symbolicate` method (`@conciv/plugin-page/rpc`), which maps stack frames to source lines. The engine now asks it over that method whenever it needs a frame's source, also to open a source in the editor; with the page plugin removed by config, opening a source opens the frame as the page gave it. `GrabFrame` now comes from `@conciv/frontend-plugin-api/grab`; `@conciv/grab` re-exports it.

The plugin host now takes the engine's own plugins as built-ins: `InstancePlugins.bound(plugins, {pre, post})` runs them in the same places as its internal plugins, and the Settings plugin list hides them, so a user can no longer reload or switch off the page plugin's engine half.
