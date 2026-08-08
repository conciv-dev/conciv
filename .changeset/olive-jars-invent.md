---
'@conciv/core': patch
---

Detect and announce a stale engine. The engine now stamps the server modules it loaded at import time and re-stats them on demand, so a rebuild that lands on disk under a running dev server stops being invisible. `/health` gains an `engine` field (`stale`, `changed`, `tracked`, `bootedAt`), a new `meta.engine` RPC carries the same reading to the widget, and the MCP server folds a warning into its `instructions` when the loaded code is behind the disk. The widget raises a standing danger notice naming what actually moved: the server code on disk is newer than the running engine, restart the dev server.
