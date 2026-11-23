---
'@conciv/ui-kit-chat': patch
'@conciv/plugin': patch
---

`@conciv/ui-kit-chat` owns its tool-card types and icon names and no longer depends on `@conciv/plugin`; the plugin SDK generates `AppIconName` from the kit's icon catalog (`pnpm --filter @conciv/plugin generate`).
