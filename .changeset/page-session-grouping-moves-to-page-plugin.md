---
'@conciv/ui-kit-chat': patch
'@conciv/plugin-page': patch
---

The chat kit no longer knows the page plugin: `Thread.Messages` and `Activity` lose the `pageSession` prop, and `createGrouping`, `createPageSessionGrouper`, `pageSessionCallParts`, `pageSessionThinkingParts` and `PAGE_SESSION_GROUP_KEY` leave `@conciv/ui-kit-chat`. The page plugin owns its grouper (`createPageSessionGrouper` from `@conciv/plugin-page/client`), and a host passes it through the existing `grouping` and `groupEntries` props. `@conciv/ui-kit-chat` exports `stickyGrouper`, which the moved grouper builds on.
