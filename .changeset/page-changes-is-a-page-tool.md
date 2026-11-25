---
'@conciv/plugin-page': patch
'@conciv/backend': patch
'@conciv/cli': patch
'@conciv/protocol': patch
'@conciv/types': patch
---

The live-edit journal is a page tool: `page.changes` (with `clear: true` to empty it after returning it) lists the page edits made in the session, for the agent, for code mode and as `conciv tools page changes [--clear]`. The engine's `page.changes` and `page.clearChanges` routes, the CLI's hand-written `page changes` command and the protocol's `PageChangeEntry` are gone; the entry type lives in the page plugin, which records each edit under a `PageConnection.change` span.
