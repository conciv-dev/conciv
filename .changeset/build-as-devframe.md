---
'@conciv/app': patch
'@conciv/backend': patch
'@conciv/backend-app-api': patch
'@conciv/backend-defaults': patch
'@conciv/backend-plugin-api': patch
'@conciv/backend-test-utils': patch
'@conciv/cli': patch
'@conciv/client': patch
'@conciv/errors': patch
'@conciv/frontend-plugin-api': patch
'@conciv/grab': patch
'@conciv/harness': patch
'@conciv/home': patch
'@conciv/it': patch
'@conciv/mascot': patch
'@conciv/mascot-react': patch
'@conciv/plugin-design': patch
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

Every library builds with tsdown, as devframe builds its packages; Vite builds only the app bundles (the widget, the
shell and the plugins' `./plugin-experimental` bundles). A library's `dependencies` and `peerDependencies` stay
external, so some kits now import packages they used to bundle. `@conciv/unplugin` depends on `@conciv/protocol`.
