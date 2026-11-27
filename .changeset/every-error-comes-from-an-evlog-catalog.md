---
'@conciv/backend-app-api': patch
'@conciv/backend-defaults': patch
'@conciv/backend-plugin-api': patch
'@conciv/backend-test-utils': patch
'@conciv/harness': patch
'@conciv/home': patch
'@conciv/serve': patch
'@conciv/types': patch
'@conciv/frontend-plugin-api': patch
'@conciv/app': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/ui-kit-terminal': patch
'@conciv/mascot': patch
'@conciv/mascot-react': patch
'@conciv/plugin-page': patch
'@conciv/plugin-ios': patch
'@conciv/plugin-tanstack': patch
'@conciv/plugin-recorder': patch
'@conciv/plugin-test-runner': patch
'@conciv/plugin-try-it': patch
'@conciv/unplugin': patch
'@conciv/try': patch
'@conciv/skills': patch
---

Every error conciv makes now comes from an evlog error catalog, one per package or domain, with a stable code, plain
message and, where someone can act on it, a why and a fix. Plugin.define accepts any Error, so a plugin fails its
entry with its own catalog error; a plugin that fails to load reports its code, message and fix. Error screens, the
run error row, toasts and plugin load errors show the fix when the error carries one.
