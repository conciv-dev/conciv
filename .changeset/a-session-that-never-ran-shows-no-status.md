---
'@conciv/ui-kit-chat': patch
'@internal/frontend-defaults': patch
'@conciv/protocol': patch
'@conciv/backend': patch
---

A new session that has not run anything yet no longer says DONE in the status bar or LAST TASK in the header. The bar shows no status until the first message runs, and the header reads just CONCIV. After the first turn they read as before, and a session that ran reads DONE as soon as it opens, before its conversation loads.

Every session row (`sessions.get`, `sessions.list`, `sessions.search`) now carries `lastRunAt`: when its newest run started, or `null` before the first run. `sessions.create` now answers `{sessionId, session}`, the new session's row, so a new session draws at once.
