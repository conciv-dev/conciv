---
'@conciv/types': patch
'@conciv/protocol': patch
'@conciv/backend': patch
'@internal/frontend-defaults': patch
'@conciv/ui-kit-chat': patch
'@conciv/plugin-page': patch
'@conciv/plugin-tanstack': patch
---

A plugin tool's look is only its own tool render: the registry catalog carries no `icon` or `label`, the generic tool card and the live status line show the tool name, and the generic card shows no mutating badge and no asks-approval hint, as opencode does, and `TOOL_ICON_KEYS`, `toolIconRender`, `cardTitle`, `pageToolMeta`, the page catalog special case and `@conciv/plugin-tanstack/client` are gone. The page and TanStack cards keep their words and icons inside their own renders. The app no longer depends on `@conciv/plugin-tanstack`.
