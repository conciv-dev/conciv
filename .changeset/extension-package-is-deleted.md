---
'@conciv/types': patch
'@conciv/cli': patch
'@conciv/backend': patch
'@conciv/app': patch
---

`@conciv/extension` is deleted and no longer published: plugins replace extensions. `@conciv/cli`, `@conciv/tools` and the widget no longer depend on it. `@conciv/types/page-types` drops `EFFECTS_SURFACE_ATTR`, and `CONCIV_UI_SELECTOR` no longer matches `[data-conciv-effects]`: nothing renders that surface any more, and plugin overlays carry `PLUGIN_OVERLAY_ATTR`.
