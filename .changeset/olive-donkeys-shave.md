---
'@conciv/solid-diffs': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/ui-kit-terminal': patch
---

Share one Solid library build config across the three Solid libraries, and externalize `@tanstack/solid-pacer` from `@conciv/solid-diffs` so a host that already loads the pacer runtime does not get a second copy inside the diff bundle.
