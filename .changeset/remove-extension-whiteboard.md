---
'@conciv/app': patch
'@internal/frontend-defaults': patch
---

`@conciv/extension-whiteboard` is removed; the whiteboard is now the `@internal/plugin-whiteboard` plugin, which is
not published yet. Drop `whiteboard()` from `extensions`. The widget bundle no longer carries the old whiteboard
extension or its styles.
