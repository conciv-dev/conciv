---
'@conciv/backend-plugin-api': patch
---

Plugins get `ctx.ui.RelativeTime` and `ctx.ui.Avatar`, the app's own relative time and avatar. `RelativeTime` shows how long ago a moment was in the app's short form, such as `3d ago`, as the session list does. `Avatar` shows a person's image, or their initials while there is none, and its `name` is what a screen reader reads.
