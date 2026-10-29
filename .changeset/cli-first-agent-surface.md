---
'@conciv/cli': patch
---

The `conciv` CLI is friendlier to coding agents. Piped output no longer carries colour escape codes (set
`FORCE_COLOR` to keep them). `conciv tools page --help` and `conciv tools react --help` list the built-in
page capabilities even before your app is running. `conciv tools page eval` returns the value of a bare
expression such as `document.title`, not only of code that uses `return`. A ref from an older `page snapshot`
now fails as stale instead of silently pointing at a different element once the page has changed. The CLI
finds the conciv engine by itself: it reads the port from `.conciv/server.json` (searching up from the
current directory), with `CONCIV_PORT` as an override, and the engine records its port there however it was
started.
