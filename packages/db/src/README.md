# db src

## Overview

Source of `@conciv/db`: the drizzle SQLite schema, `openDb` (opens `conciv.db` on `node:sqlite`, applies migrations, imports legacy rows), and typed query helpers for tool captures, page changes and run messages. `index.ts` re-exports every module plus the generated `migrations`.

## Interface

- `db.ts:openDb(stateRoot)` - returns `ConcivDb` (`db.ts:ConcivDb = ReturnType<typeof drizzle>`).
- `schema.ts` tables: `sessions` (`sessions`), `drafts` (`drafts`), `navigation` (`navigation`), `toolCaptures` (`tool_captures`), `cssBundles` (`css_bundles`), `markers` (`markers`), `pageChanges` (`page_changes`).
- `run-schema.ts` tables: `runs` (`runs`), `runMessages` (`run_messages`), `sessionHistory` (`image_history`); `RUN_PHASES`; re-exports `chatMessages`, `chatMetadata`, `chatRuns` from `chat-tables.ts`.
- `chat-tables.ts` tables: `chatRuns` (`chat_runs`, PK `run_id`; indexes `chat_runs_status_detached`, `chat_runs_thread_started`), `chatMessages` (`chat_messages`, one row per message: PK `thread_id, position`, plus `message_id`, `role`, `message_json`; index `thread_id, message_id`), `chatMetadata` (`chat_metadata`, composite PK namespace + key). `@conciv/ai/server` re-exports them for `drizzleChatStores`.
- `capture-queries.ts:writeToolCapture`, `capture-queries.ts:sessionCaptures`, `capture-queries.ts:deleteSessionCaptures`.
- `page-change-queries.ts:appendPageChange`, `page-change-queries.ts:pageChangesFor`, `page-change-queries.ts:clearPageChanges`, type `PageChangeEntry`.
- `run-queries.ts:modelOf`, `run-queries.ts:runMessagesFor`.
- `run-migrations.ts:importLegacyRuns`, `run-migrations.ts:markRunningRunsDetached`.
- `chat-thread-import.ts:importLegacyThreads`, `chat-thread-import.ts:TRANSCRIPT_NAMESPACE` (`conciv.transcript`), `chat-thread-import.ts:anchorKey`, `chat-thread-import.ts:pendingFromKey`.
- `home-schema.ts` tables (home db): `engines` (`id`, `pid`, `root`, `apiBase`, `deletedAt`), `hubConnections` (`hub_connections`: `harness`, `connectedAt`), `hubRevocations` (`hub_revocations`: autoincrement `generation`, one row per disconnect), `hubOperations` (`hub_operations`: `harness`, `pid`, `startedAt`, the lease on a harness's CLI config).
- `migrated-db.ts:openMigratedDb({file, lock, mode?, migrate})` - opens `file` with a 5000 ms busy timeout, then sets WAL and runs `migrate` while holding `BEGIN EXCLUSIVE` on the sibling `lock` sqlite file; with `mode` it chmods both files. Closes the connection when anything throws. Shared by `openDb` and `openHomeDb`.
- `home-db.ts:concivHome({homeDir?, env})` - `homeDir`, else a non-empty `env.CONCIV_HOME` (zod-parsed), else `envPaths('conciv', {suffix: ''}).data`.
- `home-db.ts:openHomeDb(home)` / `closeHomeDb(db)` / `withHomeDb(home, run)` - `HomeDb`; `registerEngine`, `retireEngine(db, id, now)`, `listEngines` (rows with `deletedAt` null), type `EngineRow`; `recordHubConnection(db, harness, now, generation?)` (one immediate transaction, like `removeHubConnection` and `takeHubOperation`, so a read-then-write never hits a stale WAL snapshot; false and no row when the hub generation is now above `generation`, which defaults to never refusing), `removeHubConnection(db, harness)` (deletes the row and inserts a `hub_revocations` row in one transaction, bumping the generation), `lastHubRevocation(db)` (the current generation, 0 when none), `takeHubOperation(db, operation, stale)` (one transaction; false when the harness holds a lease `stale` rejects, else takes or takes over it), `markHubOperationChild(db, operation, childPid)` (records the agent CLI that lease spawned; false when the lease was taken over meanwhile), `endHubOperation(db, operation)` (drops that exact lease only), `readHomeDb(home, run)` (null only when `home.db` does not exist; an access error throws, so callers fail closed; never creates the folder or the db), `hubConnections` (`{harness, connectedAt}` rows, ordered by harness); `isHomeFolderRefused(error)`.
- `engine-check.ts:checkEngines(home, {timeoutMs})` - GETs `<origin>/health` for every listed engine in parallel: matching `id` is live; refused, another `id` or a non-conciv body retires the row; a timeout reports it unreachable.
- `index.ts` - `export *` of the modules above and `export {migrations} from './migrations.gen.js'` (generated, not committed source).

## Invariants

- `schema.ts:sessions.effort` is a nullable reasoning effort (`ReasoningEffort`); null means the CLI's default.
- `schema.ts:sessions` has unique index `sessions_native_key_unique` on (`harness_kind`, `cwd`, `harness_session_id`); `origin` is one of `chat`, `agent`, `external`.
- `schema.ts:toolCaptures` primary key `tool_captures_pk` is (`tool_call_id`, `kind`, `session_id`); `markers.kind` is `new` or `compact`; `navigation.id` defaults to `'navigation'` (a single row).
- `run-schema.ts:runs.phase` is restricted to `RUN_PHASES` (`running`, `stopping`, `completed`, `failed`, `aborted`).
- `db.ts:openDb` runs, in order and under `BEGIN EXCLUSIVE` on the sibling `conciv.lock` (`migrated-db.ts:openMigratedDb`): the WAL switch, `migrateSync(migrations)`, `importLegacyRuns`, `importLegacyThreads`, `markRunningRunsDetached`, all with one `Date.now()`. Two openers of one state root (two engines, or an engine and the CLI) therefore migrate one at a time.
- `chat-thread-import.ts:importLegacyThreads` runs once: it returns early when `chatMetadata` holds key `chatThreads.importedAt` in namespace `conciv.migration`, and writes that key in the same transaction as the import.
- `run-migrations.ts:importLegacyRuns` maps legacy `runs.phase` to `chatRuns.status` via `STATUS_BY_PHASE` (`stopping` becomes `running` with `cancelRequested: true`) and inserts with `onConflictDoNothing` on `runId`; each run takes its session's `harnessKind` as `harness_id`, `claude` when the session is gone.
- `chat_messages` (migration `20261107095617_chat_messages`) is filled from every `chat_threads.messages_json` array with `json_each`, one row per message at its array index; `20261107095629_drop_chat_threads` then drops `chat_threads`. The import marker key keeps its old name `chatThreads.importedAt` so a migrated database is not imported twice.
- `chat_runs.harness_id` (migration `20261105092249_chat_run_harness`) is not null; the migration backfills it from the run's session `harness_kind`, `claude` for a run without a session.
- `capture-queries.ts:writeToolCapture` dedupes CSS by `cssBundles.hash` (`onConflictDoNothing`) and upserts a capture on the composite key; `deleteSessionCaptures` deletes CSS bundles no remaining capture references.
- `page-change-queries.ts:pageChangesFor` orders by the autoincrement `page_changes.id`, exposed as `seq`; `appendPageChange` throws when the insert returns no row.

- `home-db.ts:openHomeDb` refuses (`HomeFolderRefused`) a home folder that is a symlink, not a directory, or owned by another uid. It sets WAL and applies `homeMigrations` with drizzle's `migrateSync` through `migrated-db.ts:openMigratedDb`, holding `BEGIN EXCLUSIVE` on a sibling `home.lock` sqlite file, so concurrent openers (threads or processes) migrate one at a time and each later one finds the migrations recorded. The lock is a separate file because `migrateSync` issues its own `BEGIN` on `home.db` and reads the applied migrations before it, so two unserialized openers both run `CREATE TABLE`; and a fresh file's `PRAGMA journal_mode = WAL` returns `database is locked` at once, without the busy timeout, when two connections race the switch. A lock held past the 5000 ms busy timeout fails the open with `database is locked`.
- `home-db.ts:retireEngine` only sets `deletedAt`; no home db query deletes rows.

## Side Effects

- `home-db.ts:openHomeDb` creates the home folder (`0700`, or `chmod 0700` when it exists), creates `home.db` and `home.lock` through sqlite and sets each to mode `0600` (never through a separate `fs` file descriptor, whose close would drop the process's sqlite locks on that file), opens `home.db` with a 5000 ms busy timeout and WAL.
- `engine-check.ts:checkEngines` makes HTTP requests to each registered engine's `/health` and retires rows that fail the identity check.

- `db.ts:openDb` creates `<stateRoot>/.conciv` with `mkdirSync`, opens `conciv.db` under `concivStateDir(stateRoot)` with `DatabaseSync` (5000 ms busy timeout), creates the sibling lock file `conciv.lock` through sqlite, and sets `PRAGMA journal_mode = WAL`. Neither file is chmodded.
- `db.ts:openDb` applies schema migrations and writes legacy rows into `chatRuns`, `chatMessages` and `chatMetadata`, and sets `detachedSince` on `chatRuns` rows still `running`.
- Query helpers in `capture-queries.ts`, `page-change-queries.ts` write and delete rows in `tool_captures`, `css_bundles` and `page_changes`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/db` from the repo root (turbo builds the package and its dependencies first)
