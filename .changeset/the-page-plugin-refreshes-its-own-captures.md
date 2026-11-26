---
'@conciv/plugin-page': patch
'@conciv/types': patch
---

The page plugin refreshes its own element captures: its engine half announces each saved capture and its tool cards reload them, so the app no longer reaches into the plugin's query. The element capture and page introspection types and the capture sanitizer move from `@conciv/types` into the page plugin, and `PLUGIN_OVERLAY_ATTR` moves to `@conciv/types/ui-types`.
