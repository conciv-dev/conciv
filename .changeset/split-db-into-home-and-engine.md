---
'@conciv/home': patch
'@conciv/backend-defaults': patch
'@conciv/backend-app-api': patch
'@conciv/harness': patch
'@conciv/cli': patch
---

`@conciv/db` is gone; each owner holds its own tables. The per-user home registry (engines, hub connections) is the new package `@conciv/home`. The engine's database moves into the engine: the plugin host's tables (`sessions`, instructions, events, kv, saved permissions) live in `@conciv/backend-app-api`, and the draft, marker, inbox and chat tables, `openDb` and the migrations live in `@conciv/backend-defaults`. Existing `conciv.db` and `home.db` files open unchanged: the migration files, their names and their order are the same.
