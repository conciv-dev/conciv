# db src

## Overview

Source of `@conciv/db`: the drizzle SQLite schema, `openDb` (opens `conciv.db` on `node:sqlite`, applies migrations, marks running runs detached), and typed query helpers for chat runs and messages. `index.ts` re-exports every module plus the generated `migrations`.

## Interface

- `db.ts:openDb(stateRoot)` - returns `ConcivDb` (`db.ts:ConcivDb = ReturnType<typeof drizzle>`).
- `schema.ts` tables: `sessions` (`sessions`), `drafts` (`drafts`), `markers` (`markers`); the plugin host's tables, which `@conciv/plugin-host` reads and writes on its own connection: `InstructionBlobTable` (`instruction_blob`), `InstructionStateTable` (`instruction_state`), `EventSequenceTable` (`event_sequence`), `EventTable` (`event`), `KVTable` (`kv`), `PermissionTable` (`permission`).
- `run-schema.ts` tables: `chatRuns` (`chat_runs`, PK `run_id`; indexes `chat_runs_status_detached`, `chat_runs_thread_started`), `chatMessages` (`chat_messages`, one row per message: PK `thread_id, position`, plus `message_id`, `role`, `message_json`; index `thread_id, message_id`), `chatMetadata` (`chat_metadata`, composite PK namespace + key). `@conciv/ai/server` re-exports them for `drizzleChatStores`.
- `index.ts:readModel` reads a session's model; `run-migrations.ts:markRunningRunsDetached` stamps every running chat run as detached at boot.
- `run-schema.ts` also holds the chat metadata namespace for harness transcripts (`conciv.transcript`) and the key under which a thread's transcript anchor is stored.
- `home-schema.ts` tables (home db): `engines` (`id`, `pid`, `root`, `apiBase`, `deletedAt`), `hubConnections` (`hub_connections`: `harness`, `connectedAt`), `hubRevocations` (`hub_revocations`: autoincrement `generation`, one row per disconnect), `hubOperations` (`hub_operations`: `harness`, `pid`, `startedAt`, the lease on a harness's CLI config).
- `open/migrated-db.ts:openMigratedDb({file, lock, migrate})` - opens `file` with a 5000 ms busy timeout, then sets WAL and runs `migrate` while holding `BEGIN EXCLUSIVE` on the sibling `lock` sqlite file; it chmods nothing. Closes the connection when anything throws. Shared by `openDb` and `openHomeDb`.
- `home-db.ts:concivHome({homeDir?, env})` - `homeDir`, else a non-empty `env.CONCIV_HOME` (zod-parsed), else `envPaths('conciv', {suffix: ''}).data`.
- `home-db.ts:prepareHome(home)` - resolves to a `PreparedHome` (a branded string), the only input `openHomeDb` and `withHomeDb` take, so the folder checks and file modes run once, without blocking, before the synchronous open.
- `home-db.ts:openHomeDb(preparedHome)` / `closeHomeDb(db)` / `withHomeDb(preparedHome, run)` - `HomeDb`; `registerEngine`, `retireEngine(db, id, now)`, `listEngines` (rows with `deletedAt` null, in registration order), type `EngineRow`; `recordHubConnection(db, harness, now, generation?)` (one immediate transaction, like `removeHubConnection` and `takeHubOperation`, so a read-then-write never hits a stale WAL snapshot; false and no row when the hub generation is now above `generation`, which defaults to never refusing), `removeHubConnection(db, harness)` (deletes the row and inserts a `hub_revocations` row in one transaction, bumping the generation), `lastHubRevocation(db)` (the current generation, 0 when none), `takeHubOperation(db, operation, stale)` (one transaction; false when the harness holds a lease `stale` rejects, else takes or takes over it), `markHubOperationChild(db, operation, childPid)` (records the agent CLI that lease spawned; false when the lease was taken over meanwhile), `endHubOperation(db, operation)` (drops that exact lease only), `readHomeDb(home, run)` (async; resolves to null only when `home.db` does not exist; an access error rejects, so callers fail closed; never creates the folder or the db), `hubConnections` (`{harness, connectedAt}` rows, ordered by harness); `isHomeFolderRefused(error)`.
- `index.ts:checkEngines(home, {timeoutMs, roots?})` - with `roots`, checks only the rows whose root is listed (a caller asking the unreachable ones again with a longer timeout); retires a row whose pid is dead or whose root is gone, else GETs `<origin>/health` for every listed engine in parallel: matching `id` is live; refused or another `id` retires the row; a body that is not engine JSON or a timeout reports it unreachable. Health is read from the JSON only, never from error text.
- `index.ts` - `export *` of the modules above and `export {migrations} from './migrations.gen.js'` (generated, not committed source).

## Invariants

- `schema.ts:sessions.effort` is a nullable reasoning effort (`ReasoningEffort`); null means the CLI's default.
- `schema.ts:sessions` has unique index `sessions_native_key_unique` on (`harness_kind`, `cwd`, `harness_session_id`); `origin` is one of `chat`, `agent`, `external`.
- `markers.kind` is `new` or `compact`.
- `db.ts:openDb` runs, in order and under `BEGIN EXCLUSIVE` on the sibling `conciv.lock` (`open/migrated-db.ts:openMigratedDb`): the WAL switch, the migrations, then `markRunningRunsDetached`. Two openers of one state root (two engines, or an engine and the CLI) therefore migrate one at a time.
- Chat databases from before the plugin port are not imported: migration `20261119205922_drop_legacy_runs` drops the old `runs`, `run_messages` and `image_history` tables with whatever they held.
- `chat_messages` (migration `20261107095617_chat_messages`) is filled from every `chat_threads.messages_json` array with `json_each`, one row per message at its array index; `20261107095629_drop_chat_threads` then drops `chat_threads`.
- Migration `20261115104642_plugin_host_tables` creates `event_sequence`, `event`, `kv` and `permission` with `IF NOT EXISTS`, so it runs under the `conciv.lock` lock with every other migration, and a database whose tables a branch build of the plugin host already made keeps them and their rows (that build's own `__plugin_host_migrations` table is left in place and read by nothing).
- `chat_runs.harness_id` (migration `20261105092249_chat_run_harness`) is not null; the migration backfills it from the run's session `harness_kind`, `claude` for a run without a session.

- `home-db.ts:prepareHome` refuses (`HomeFolderRefused`) a home folder that is a symlink, not a directory, or owned by another uid. `openHomeDb` sets WAL and applies `homeMigrations` with drizzle's `migrateSync` through `open/migrated-db.ts:openMigratedDb`, holding `BEGIN EXCLUSIVE` on a sibling `home.lock` sqlite file, so concurrent openers (threads or processes) migrate one at a time and each later one finds the migrations recorded. The lock is a separate file because `migrateSync` issues its own `BEGIN` on `home.db` and reads the applied migrations before it, so two unserialized openers both run `CREATE TABLE`; and a fresh file's `PRAGMA journal_mode = WAL` returns `database is locked` at once, without the busy timeout, when two connections race the switch. A lock held past the 5000 ms busy timeout fails the open with `database is locked`.
- `home-db.ts:retireEngine` only sets `deletedAt`; no home db query deletes rows.

## Side Effects

- `home-db.ts:prepareHome` creates the home folder (`0700`, or `chmod 0700` when it exists), and creates `home.db` and `home.lock` by opening and closing each through sqlite, never through a separate `fs` file descriptor (closing any descriptor on a file drops every lock the process holds on it, sqlite's included), then chmods each to `0600` by path.
- `home-db.ts:openHomeDb` opens `home.db` with a 5000 ms busy timeout and WAL.
- `index.ts:checkEngines` makes HTTP requests to each registered engine's `/health` and retires rows that fail the identity check.

- `db.ts:openDb` is a scoped Effect: it creates `<stateRoot>/.conciv` with the async `createConcivStateDir` (`@conciv/protocol/state-types`), builds one `@effect/sql-sqlite-node` `SqliteClient` on `conciv.db` under `concivStateDir(stateRoot)` (one serialized connection, WAL, 5000 ms busy timeout, foreign keys on as `node:sqlite` opens it), and migrates while holding `BEGIN EXCLUSIVE` on the sibling lock file `conciv.lock`. The plugin host's `Database.configuredClient` on that same client adds opencode's pragmas (`synchronous = NORMAL`, `cache_size = -64000`, `foreign_keys = ON`), so they apply to every engine write too. Neither file is chmodded.
- `db.ts:openDb` applies schema migrations and sets `detachedSince` on `chatRuns` rows still `running`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/db` from the repo root (turbo builds the package and its dependencies first)
