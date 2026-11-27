---
'@conciv/errors': patch
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
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-tap': patch
'@conciv/solid-streamdown': patch
---

Every error conciv makes now comes from an evlog error catalog, with a stable code, a plain message and, where
someone can act on it, a why and a fix. The core catalogs live in one new package, @conciv/errors, so packages
compare codes without importing each other; each plugin keeps its own catalog, and the app provides @conciv/errors
to plugins. Plugin.define accepts any Error, so a plugin fails its entry with its own catalog error; a plugin that
fails to load reports its code, message and fix. Error screens, the run error row, toasts and plugin load errors show
the fix when the error carries one, and the conciv-try CLI prints a failure as its code and message, then its why and
fix only when they are set.
