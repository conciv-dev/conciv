---
'@conciv/frontend-plugin-api': patch
'@conciv/solid-diffs': patch
---

The widget downloads about 480 KB (gzip) less before a diff or code block shows. `@conciv/solid-diffs` now loads its highlight worker the first time a diff or code block renders (or a thread warms it), not with the rest of the widget. `@conciv/frontend-plugin-api` now declares `"sideEffects": false`, so a bundler can drop the modules a host app does not use, for example when `@conciv/react` imports only `listenForPortals`.
