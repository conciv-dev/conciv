---
'@conciv/ui-kit-system': patch
'@conciv/frontend-plugin-api': patch
---

Add `Callout`, an inline note in four tones (info, success, warn, danger) built from `Callout.Root`, `Callout.Icon`, `Callout.Title` and `Callout.Description`, and expose it to plugins as `ctx.ui.Callout` (`title`, `tone`, `icon`, the description as children).
