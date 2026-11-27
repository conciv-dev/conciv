---
'@conciv/protocol': patch
'@conciv/backend-app-api': patch
'@conciv/backend-defaults': patch
'@conciv/backend-plugin-api': patch
'@conciv/backend-test-utils': patch
'@conciv/backend': patch
'@conciv/cli': patch
'@conciv/client': patch
'@conciv/frontend-plugin-api': patch
'@conciv/grab': patch
'@conciv/harness': patch
'@conciv/home': patch
'@conciv/it': patch
'@conciv/mascot-react': patch
'@conciv/mascot': patch
'@conciv/preact': patch
'@conciv/react': patch
'@conciv/serve': patch
'@conciv/simulation': patch
'@conciv/solid': patch
'@conciv/storage-history': patch
'@conciv/try': patch
'@conciv/types': patch
'@conciv/unplugin': patch
'@conciv/solid-diffs': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/ui-kit-terminal': patch
'@conciv/ui-kit-tap': patch
'@conciv/plugin-try-it': patch
---

Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone.
