---
'@conciv/db': patch
---

Opening a project's conciv.db from two processes at once (two engines on one root, or an engine and the CLI) no longer fails: the WAL switch, migrations and legacy imports run one opener at a time under a `conciv.lock` file, the same lock the home db uses.
