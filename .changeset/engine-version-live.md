---
'@conciv/backend': patch
---

The engine reads its reported version (`app.version`) and its stale-code report (`staleness`) on every request: both are functions, and one that answers `undefined` falls back to the core package version and the engine's own stale check.
