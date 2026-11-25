---
'@conciv/backend-plugin-api': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-system': patch
'@conciv/app': patch
'@conciv/plugin-tanstack': patch
'@conciv/plugin-page': patch
'@conciv/plugin-test-runner': patch
'@conciv/plugin-recorder': patch
---

A plugin declares its own icons as SVG documents in `Plugin.define({icons})`, and names them through `ctx.icons` in every SDK icon field and in `ctx.ui.Icon`, as opencode's plugins do: `IconName` is now `AppIconName | PluginIconName`. The app draws every icon name through one `Icon` from `@conciv/ui-kit-chat`, and tool cards show an icon in their header (the TanStack cards and the inspector chip show the TanStack logo).
