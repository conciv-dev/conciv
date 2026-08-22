---
'@conciv/db': patch
---

Adds the append-only `settings_log` table (project db) and a new `openGlobalDb()` opening `~/.conciv/conciv.db` (WAL, settings-only schema), a settings key registry in `@conciv/protocol` (v1 registers `scheme`), and a `settings` oRPC group (`get`/`set`/`clear`/`history`) with layered project-over-global-over-default resolution and provenance. Every settings write emits a `conciv.settings-changed` CUSTOM event on the existing chat stream so a connected widget can react. Foundation only: no settings UI panel and no chat-agent settings tool yet.
