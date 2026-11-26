# backend-defaults db

## Overview

The engine's `conciv.db`: its own tables, `openDb` and `readModel`.

## Interface

- `connection.ts:openDb(stateRoot)` - returns `ConcivDb` (`connection.ts:ConcivDb`).
- `schema.ts` tables: `drafts`, `markers`, `SessionInboxTable` (`session_inbox`). The plugin host's tables are defined in `@conciv/backend-app-api`, which owns them: `sessions`, `InstructionBlobTable` and `InstructionStateTable` (`core/session/sql.ts`), `EventSequenceTable` and `EventTable` (`core/event/sql.ts`), `KVTable` (`core/kv/sql.ts`), `PermissionTable` (`core/permission/sql.ts`).
- `run-schema.ts` tables: `chatRuns` (`chat_runs`, PK `run_id`; indexes `chat_runs_status_detached`, `chat_runs_thread_started`), `chatMessages` (`chat_messages`, one row per message: PK `thread_id, position`, plus `message_id`, `role`, `message_json`; index `thread_id, message_id`), `chatMetadata` (`chat_metadata`, composite PK namespace + key).
- `read-model.ts:readModel` reads a session's model; `run-migrations.ts:markRunningRunsDetached` stamps every running chat run as detached at boot.
- `run-schema.ts` also holds the chat metadata namespace for harness transcripts (`conciv.transcript`) and the key under which a thread's transcript anchor is stored.

## Invariants

- One migration set, `../../drizzle` (`../../drizzle.config.ts` lists this folder's schema files and resolves the plugin host's `sql` modules through `@conciv/backend-app-api`), covers every table in `conciv.db`: the migration folders, their names and their order are the ones `@conciv/db` shipped, so a database any earlier release migrated opens with nothing to re-apply. Each owner defines its tables; the engine, which opens the file, applies the history.
- `@conciv/backend-app-api/core/session/sql` `sessions.effort` is a nullable reasoning effort (`ReasoningEffort`); null means the CLI's default.
- `@conciv/backend-app-api/core/session/sql` `sessions` has unique index `sessions_native_key_unique` on (`harness_kind`, `cwd`, `harness_session_id`); `origin` is one of `chat`, `agent`, `external`.
- `markers.kind` is `new` or `compact`.
- `connection.ts:openDb` runs, in order and under `BEGIN EXCLUSIVE` on the sibling `conciv.lock` (`takeMigrationLock` from `@conciv/home/migrated-db`): the WAL switch, the migrations, then `markRunningRunsDetached`. Two openers of one state root (two engines, or an engine and the CLI) therefore migrate one at a time.
- Chat databases from before the plugin port are not imported: migration `20261119205922_drop_legacy_runs` drops the old `runs`, `run_messages` and `image_history` tables with whatever they held.
- `chat_messages` (migration `20261107095617_chat_messages`) is filled from every `chat_threads.messages_json` array with `json_each`, one row per message at its array index; `20261107095629_drop_chat_threads` then drops `chat_threads`.
- Migration `20261115104642_plugin_host_tables` creates `event_sequence`, `event`, `kv` and `permission` with `IF NOT EXISTS`, so it runs under the `conciv.lock` lock with every other migration, and a database whose tables a branch build of the plugin host already made keeps them and their rows (that build's own `__plugin_host_migrations` table is left in place and read by nothing).
- `chat_runs.harness_id` (migration `20261105092249_chat_run_harness`) is not null; the migration backfills it from the run's session `harness_kind`, `claude` for a run without a session.

## Side Effects

- `connection.ts:openDb` is a scoped Effect: it creates `<stateRoot>/.conciv` with the async `createConcivStateDir` (`@conciv/protocol/state-types`), builds one `@effect/sql-sqlite-node` `SqliteClient` on `conciv.db` under `concivStateDir(stateRoot)` (one serialized connection, WAL, 5000 ms busy timeout, foreign keys on as `node:sqlite` opens it), and migrates while holding `BEGIN EXCLUSIVE` on the sibling lock file `conciv.lock`. The plugin host's `Database.configuredClient` on that same client adds opencode's pragmas (`synchronous = NORMAL`, `cache_size = -64000`, `foreign_keys = ON`), so they apply to every engine write too. Neither file is chmodded.
- `connection.ts:openDb` applies schema migrations and sets `detachedSince` on `chatRuns` rows still `running`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/backend-defaults` from the repo root
