---
'@conciv/plugin': patch
'@conciv/extension-compiler': patch
'@conciv/client': patch
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/embed': patch
'@conciv/extension-ios': patch
'@conciv/extension-page': patch
'@conciv/extension-recorder': patch
'@conciv/extension-tanstack': patch
'@conciv/extension-terminal': patch
'@conciv/extension-test-runner': patch
'@conciv/extension-try-it': patch
'@conciv/extension-whiteboard': patch
'@conciv/grab': patch
'@conciv/mascot': patch
'@conciv/protocol': patch
'@conciv/solid-diffs': patch
'@conciv/solid-streamdown': patch
'@conciv/storage-history': patch
'@conciv/tools': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-tap': patch
'@conciv/ui-kit-terminal': patch
'@conciv/solid': patch
---

Workspace packages expose their source through a `conciv-source` export condition, and the conciv Vite plugin no longer rewrites `@conciv/*` dist imports to `src/`. Hosts get dist unless they add `conciv-source` to `resolve.conditions`; `concivSrcEntry` and the `CONCIV_E2E` switch are gone.
