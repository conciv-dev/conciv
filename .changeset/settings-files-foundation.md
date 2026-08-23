---
'@conciv/core': patch
---

Files-based layered settings foundation: a namespaced settings registry in `@conciv/protocol`
(`appearance.scheme`), a `settings` oRPC group (`get`/`set`/`clear`/`applyGlobally`/`history`)
resolving the project layer under `<stateRoot>/.conciv/` over the global layer under `~/.conciv/`
over registry defaults. Each layer honors `settings.jsonc` if present, otherwise `settings.json`;
comments are supported in `.jsonc` and survive programmatic writes. Includes per-layer content
revisions for optimistic concurrency, atomic persistence, a cross-process lock on the shared global
file, an append-only history sidecar, and live settings-changed events broadcast to every attached
session.

Adds dependencies on `c12`, `jsonc-parser`, `write-file-atomic` and `proper-lockfile`.
