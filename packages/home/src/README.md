# home src

## Overview

Source of `@conciv/home`: the home db schema, its opener and queries, the shared migration lock, and the engine health check.

## Interface

- `registry/home-schema.ts` tables (home db): `engines` (`id`, `pid`, `root`, `apiBase`, `deletedAt`), `hubConnections` (`hub_connections`: `harness`, `connectedAt`), `hubRevocations` (`hub_revocations`: autoincrement `generation`, one row per disconnect), `hubOperations` (`hub_operations`: `harness`, `pid`, `startedAt`, the lease on a harness's CLI config).
- `registry/migrated-db.ts:openMigratedDb({file, lock, migrate})` - opens `file` with a 5000 ms busy timeout, then sets WAL and runs `migrate` while holding `BEGIN EXCLUSIVE` on the sibling `lock` sqlite file; it chmods nothing. Closes the connection when anything throws. Used by `openHomeDb`; the lock itself is `@conciv/types/migration-lock`, shared with the engine's `openDb`.
- `registry/home-db.ts:concivHome({homeDir?, env})` - `homeDir`, else a non-empty `env.CONCIV_HOME` (zod-parsed), else `envPaths('conciv', {suffix: ''}).data`.
- `registry/home-db.ts:prepareHome(home)` - resolves to a `PreparedHome` (a branded string), the only input `openHomeDb` and `withHomeDb` take, so the folder checks and file modes run once, without blocking, before the synchronous open.
- `registry/home-db.ts:openHomeDb(preparedHome)` / `closeHomeDb(db)` / `withHomeDb(preparedHome, run)` - `HomeDb`; `registerEngine`, `retireEngine(db, id, now)`, `listEngines` (rows with `deletedAt` null, in registration order), type `EngineRow`; `recordHubConnection(db, harness, now, generation?)` (one immediate transaction, like `removeHubConnection` and `takeHubOperation`, so a read-then-write never hits a stale WAL snapshot; false and no row when the hub generation is now above `generation`, which defaults to never refusing), `removeHubConnection(db, harness)` (deletes the row and inserts a `hub_revocations` row in one transaction, bumping the generation), `lastHubRevocation(db)` (the current generation, 0 when none), `takeHubOperation(db, operation, stale)` (one transaction; false when the harness holds a lease `stale` rejects, else takes or takes over it), `markHubOperationChild(db, operation, childPid)` (records the agent CLI that lease spawned; false when the lease was taken over meanwhile), `endHubOperation(db, operation)` (drops that exact lease only), `readHomeDb(home, run)` (async; resolves to null only when `home.db` does not exist; an access error rejects, so callers fail closed; never creates the folder or the db), `hubConnections` (`{harness, connectedAt}` rows, ordered by harness); `isHomeFolderRefused(error)`.
- `home.ts:checkEngines(home, {timeoutMs, roots?})` - with `roots`, checks only the rows whose root is listed (a caller asking the unreachable ones again with a longer timeout); retires a row whose pid is dead or whose root is gone, else GETs `<origin>/health` for every listed engine in parallel: matching `id` is live; refused or another `id` retires the row; a body that is not engine JSON or a timeout reports it unreachable. Health is read from the JSON only, never from error text.

## Invariants

- `registry/home-db.ts:prepareHome` refuses (`HomeFolderRefused`) a home folder that is a symlink, not a directory, or owned by another uid. `openHomeDb` sets WAL and applies `homeMigrations` with drizzle's `migrateSync` through `registry/migrated-db.ts:openMigratedDb`, holding `BEGIN EXCLUSIVE` on a sibling `home.lock` sqlite file, so concurrent openers (threads or processes) migrate one at a time and each later one finds the migrations recorded. The lock is a separate file because `migrateSync` issues its own `BEGIN` on `home.db` and reads the applied migrations before it, so two unserialized openers both run `CREATE TABLE`; and a fresh file's `PRAGMA journal_mode = WAL` returns `database is locked` at once, without the busy timeout, when two connections race the switch. A lock held past the 5000 ms busy timeout fails the open with `database is locked`.
- `registry/home-db.ts:retireEngine` only sets `deletedAt`; no home db query deletes rows.

## Side Effects

- `registry/home-db.ts:prepareHome` creates the home folder (`0700`, or `chmod 0700` when it exists), and creates `home.db` and `home.lock` by opening and closing each through sqlite, never through a separate `fs` file descriptor (closing any descriptor on a file drops every lock the process holds on it, sqlite's included), then chmods each to `0600` by path.
- `registry/home-db.ts:openHomeDb` opens `home.db` with a 5000 ms busy timeout and WAL.
- `home.ts:checkEngines` makes HTTP requests to each registered engine's `/health` and retires rows that fail the identity check.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/home` from the repo root
