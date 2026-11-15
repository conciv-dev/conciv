---
'@conciv/plugin': patch
'@conciv/plugin-page': patch
'@conciv/page': patch
'@conciv/core': patch
'@conciv/app': patch
'@conciv/plugin-host': patch
---

Plugins can now use the page through two contracts from `@conciv/plugin/experimental/page`: `Page` (find the source line behind stack frames, show a toast on the page, and the settings a page capture needs) and `ReactTree` (read the React tree behind an element). conciv's built-in page plugin provides both in the widget. The new package `@conciv/plugin-page` is the page plugin's engine half: the engine runs it and answers its `symbolicate` method (`@conciv/plugin-page/rpc`), and it exports `symbolicateFrame` and `symbolicateFrames`, which map stack frames to source lines. `GrabFrame` now comes from `@conciv/plugin/experimental/grab`; `@conciv/grab` re-exports it.

The plugin host now takes the engine's own plugins as built-ins: `InstancePlugins.bound(plugins, {pre, post})` runs them in the same places as its internal plugins, and the Settings plugin list hides them, so a user can no longer reload or switch off the page plugin's engine half.
