# core/src/sessions

## Overview

Session persistence and plumbing: an in-memory per-session pub/sub bus for chat events, listing of harness slash commands, and Drizzle CRUD on the `sessions` table that maps conciv session ids to native harness session ids and builds the session list.

## Interface

- `listCommands` / `mcpUrlFor` / `CommandSource` (`commands.ts`): commands tagged 'mcp', 'plugin' or 'harness'
- `createSessionBus` / `SessionBus` (`session-bus.ts`): publish, listen, events(sessionId, signal)
- `createSessionSearch` (`session-search.ts`): one in-memory Orama index per engine over every native session's title and message text. Nothing is read at engine start or before the first `sessions.list`; `listed()` (called after that first list answers) starts a background build on the next `setImmediate`. A build or refresh is single-flight through a `@tanstack/pacer` `AsyncQueuer` (concurrency 1, one trailing run): a title pass walks every `list` page per harness (sessions no longer listed are removed; title, `updatedAt` and `sizeBytes` come from the walk) and publishes an `indexed` event when it changed the index, then a text pass reads unread sessions smallest transcript first in batches of 8, yielding to pending requests between batches, and publishes another `indexed` event when it read any. A search answers from the index at once and queues one refresh. A session's text is re-read when it is new, unread, or changed and last read at least 30 s ago (`LIVE_REINDEX_MS`); hits take their meta from the index document, never from `meta()`; every document is parsed by a zod schema before it is inserted; a session whose `messages` throws keeps its old body with `read: false`, is logged once, and is retried on each later refresh; a harness whose `list` throws is logged and the others keep indexing; ids where the index and the walk disagree after a title pass are logged. `changes(signal)` subscribes to the `indexed` events
- `rowById` / `currentRow` / `rowByNativeId` / `rowByNativeRef` (`session-rows.ts`)
- `createRow` / `ensureRow` / `nativeIdFor` / `recordNativeId` (`session-rows.ts`)
- `resolveRow` / `openNativeRow` / `ensureAgentRow` / `mintExternalRow` / `anonymousExternalRow` (`session-rows.ts`)
- `tombstoneRow` / `restoreRow` / `recordFirstTitle` / `sweepEmptyRows` / `switchRowHarness` (`session-rows.ts`)
- `listSessionMetas` / `SessionListInput` / `NativeList` / `RowScope` (`session-rows.ts`): `SessionMeta[]` sorted by updatedAt descending, each carrying its `harnessKind`

## Invariants

- `listCommands` (`commands.ts`): uses the session's harness (`harnessFor`); `{commands: []}` without `harness.commands`; mcpUrl passed only when `capabilities.mcp === 'http'`
- `createSessionBus` (`session-bus.ts`): empty listener sets are deleted; `events` unlistens on abort, cancel and finally
- `session-rows.ts`: rows are validated with `SessionRecordSchema.parse`; default ids are `conciv_<uuid>`
- `claimNativeRow` (`session-rows.ts`): insert onConflictDoNothing on (harnessKind, cwd, harnessSessionId), then re-read
- `resolveRow` (`session-rows.ts`): conciv id, then harness id, then latest non-deleted chat row for the cwd (by realpath), then a new id
- `listSessionMetas` (`session-rows.ts`): skips invalid rows, filters by cwd and deletedAt unless `includeHidden`, materializes unclaimed native sessions; a native session is claimed by the row whose current (harnessKind, native id) matches or whose earlier-natives list (`chat_metadata` namespace `conciv.session.earlierNatives`, key = session id, read in one query, zod `.catch([])`) holds it; a hidden owner is undeleted instead of listing the native separately
- `switchRowHarness` (`session-rows.ts`): one transaction appends the outgoing non-null `{harnessKind, nativeId}` to the session's earlier-natives list, sets `harnessKind`, nulls `harnessSessionId` and `model`, and deletes the session's transcript anchor; the earlier-natives list only claims list entries and never feeds resume

## Side Effects

- `session-rows.ts`: SQLite reads and writes on `sessions`
- `listSessionMetas` (`session-rows.ts`): inserts or undeletes rows while listing; `logError` for invalid rows
- `listCommands` (`commands.ts`): calls the harness adapter's `commands`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
