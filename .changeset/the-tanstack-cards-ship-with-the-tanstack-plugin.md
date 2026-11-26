---
'@conciv/plugin-tanstack': patch
'@conciv/backend-plugin-api': patch
'@conciv/app': patch
---

The thread cards for the TanStack tools now ship with the TanStack plugin and draw through `ctx.ui`, so they show only
in projects that load the plugin. The plugin exports `./client`, whose `tanstackToolMeta(name)` gives the label, icon
and summary of each TanStack tool. `IconName` adds `corner-down-right`.
