# db src

## Overview

Source of `@conciv/db`: the drizzle SQLite schema, `openDb` (opens `conciv.db` on `node:sqlite`, applies migrations, imports legacy rows), and typed query helpers for tool captures, page changes and run messages. `index.ts` re-exports every module plus the generated `migrations`.

## Interface

- `db.ts:openDb(stateRoot)` - returns `ConcivDb` (`db.ts:ConcivDb = ReturnType<typeof drizzle>`).
- `schema.ts` tables: `sessions` (`sessions`), `drafts` (`drafts`), `navigation` (`navigation`), `toolCaptures` (`tool_captures`), `cssBundles` (`css_bundles`), `markers` (`markers`), `pageChanges` (`page_changes`).
- `run-schema.ts` tables: `runs` (`runs`), `runMessages` (`run_messages`), `sessionHistory` (`image_history`); `RUN_PHASES`; re-exports `chatMetadata`, `chatRuns`, `chatThreads` from `@conciv/ai/server`.
- `capture-queries.ts:writeToolCapture`, `capture-queries.ts:sessionCaptures`, `capture-queries.ts:deleteSessionCaptures`.
- `page-change-queries.ts:appendPageChange`, `page-change-queries.ts:pageChangesFor`, `page-change-queries.ts:clearPageChanges`, type `PageChangeEntry`.
- `run-queries.ts:modelOf`, `run-queries.ts:runMessagesFor`.
- `run-migrations.ts:importLegacyRuns`, `run-migrations.ts:markRunningRunsDetached`.
- `chat-thread-import.ts:importLegacyThreads`, `chat-thread-import.ts:TRANSCRIPT_NAMESPACE` (`conciv.transcript`), `chat-thread-import.ts:anchorKey`, `chat-thread-import.ts:pendingFromKey`.
- `index.ts` - `export *` of the modules above and `export {migrations} from './migrations.gen.js'` (generated, not committed source).

## Invariants

- `schema.ts:sessions` has unique index `sessions_native_key_unique` on (`harness_kind`, `cwd`, `harness_session_id`); `origin` is one of `chat`, `agent`, `external`.
- `schema.ts:toolCaptures` primary key `tool_captures_pk` is (`tool_call_id`, `kind`, `session_id`); `markers.kind` is `new` or `compact`; `navigation.id` defaults to `'navigation'` (a single row).
- `run-schema.ts:runs.phase` is restricted to `RUN_PHASES` (`running`, `stopping`, `completed`, `failed`, `aborted`).
- `db.ts:openDb` runs, in order: `migrateSync(migrations)`, `importLegacyRuns`, `importLegacyThreads`, `markRunningRunsDetached`, all with one `Date.now()`.
- `chat-thread-import.ts:importLegacyThreads` runs once: it returns early when `chatMetadata` holds key `chatThreads.importedAt` in namespace `conciv.migration`, and writes that key in the same transaction as the import.
- `run-migrations.ts:importLegacyRuns` maps legacy `runs.phase` to `chatRuns.status` via `STATUS_BY_PHASE` (`stopping` becomes `running` with `cancelRequested: true`) and inserts with `onConflictDoNothing` on `runId`.
- `capture-queries.ts:writeToolCapture` dedupes CSS by `cssBundles.hash` (`onConflictDoNothing`) and upserts a capture on the composite key; `deleteSessionCaptures` deletes CSS bundles no remaining capture references.
- `page-change-queries.ts:pageChangesFor` orders by the autoincrement `page_changes.id`, exposed as `seq`; `appendPageChange` throws when the insert returns no row.

## Side Effects

- `db.ts:openDb` creates `<stateRoot>/.conciv` with `mkdirSync`, opens `conciv.db` under `concivStateDir(stateRoot)` with `DatabaseSync` (5000 ms busy timeout), and sets `PRAGMA journal_mode = WAL`.
- `db.ts:openDb` applies schema migrations and writes legacy rows into `chatRuns`, `chatThreads` and `chatMetadata`, and sets `detachedSince` on `chatRuns` rows still `running`.
- Query helpers in `capture-queries.ts`, `page-change-queries.ts` write and delete rows in `tool_captures`, `css_bundles` and `page_changes`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/db` from the repo root (turbo builds the package and its dependencies first)
