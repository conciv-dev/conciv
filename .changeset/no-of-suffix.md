---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/cli': patch
'@conciv/client': patch
'@conciv/core': patch
'@conciv/db': patch
'@conciv/embed': patch
'@conciv/extension': patch
'@conciv/extension-compiler': patch
'@conciv/extension-page': patch
'@conciv/extension-recorder': patch
'@conciv/extension-tanstack': patch
'@conciv/extension-terminal': patch
'@conciv/extension-whiteboard': patch
'@conciv/grab': patch
'@conciv/harness': patch
'@conciv/harness-init': patch
'@conciv/mascot': patch
'@conciv/mascot-react': patch
'@conciv/page': patch
'@conciv/protocol': patch
'@conciv/tools': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-tap': patch
'@conciv/unplugin': patch
---

Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/protocol/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`.
