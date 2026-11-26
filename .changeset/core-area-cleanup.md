---
'@conciv/backend': patch
---

Remove dead code left over from the old extension system in core, protocol, contract, chat and client, and fix the stale READMEs. The `harnessBin` setting and its `claudePath` / `CONCIV_CLAUDE_PATH` aliases are removed, because they never took effect. The import of pre-plugin chat databases is removed, and a migration drops the legacy runs, run_messages and image_history tables.
