---
'@conciv/app': patch
'@conciv/backend': patch
'@conciv/backend-app-api': patch
'@conciv/backend-defaults': patch
'@conciv/backend-plugin-api': patch
'@conciv/backend-test-utils': patch
'@conciv/cli': patch
'@conciv/client': patch
'@conciv/frontend-plugin-api': patch
'@conciv/grab': patch
'@conciv/harness': patch
'@conciv/home': patch
'@conciv/it': patch
'@conciv/mascot': patch
'@conciv/mascot-react': patch
'@conciv/plugin-ios': patch
'@conciv/plugin-page': patch
'@conciv/plugin-recorder': patch
'@conciv/plugin-tanstack': patch
'@conciv/plugin-test-runner': patch
'@conciv/plugin-try-it': patch
'@conciv/plugin-whiteboard': patch
'@conciv/preact': patch
'@conciv/protocol': patch
'@conciv/react': patch
'@conciv/serve': patch
'@conciv/simulation': patch
'@conciv/skills': patch
'@conciv/solid': patch
'@conciv/solid-diffs': patch
'@conciv/solid-streamdown': patch
'@conciv/storage-history': patch
'@conciv/try': patch
'@conciv/types': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-tap': patch
'@conciv/ui-kit-terminal': patch
'@conciv/unplugin': patch
---

Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone. Libraries with several entries ship one file per module, so no declaration chunk sits outside `exports`. `experimental()` configures only the `client` environment.
