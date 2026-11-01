# core/src/sessions

## Overview

Session persistence and plumbing: an in-memory per-session pub/sub bus for chat events, listing of harness slash commands, and Drizzle CRUD on the `sessions` table that maps conciv session ids to native harness session ids and builds the session list.

## Interface

- `listCommands` / `mcpUrlFor` / `CommandSource` (`commands.ts`): commands tagged 'mcp', 'plugin' or 'harness'
- `createSessionBus` / `SessionBus` (`session-bus.ts`): publish, listen, events(sessionId, signal)
- `rowById` / `currentRow` / `rowByNativeId` / `rowByNativeRef` (`session-rows.ts`)
- `createRow` / `ensureRow` / `nativeIdFor` / `recordNativeId` (`session-rows.ts`)
- `resolveRow` / `openNativeRow` / `ensureAgentRow` / `mintExternalRow` / `anonymousExternalRow` (`session-rows.ts`)
- `tombstoneRow` / `restoreRow` / `recordFirstTitle` / `sweepEmptyRows` (`session-rows.ts`)
- `listSessionMetas` / `SessionListInput` / `RowScope` (`session-rows.ts`): `SessionMeta[]` sorted by updatedAt descending

## Invariants

- `listCommands` (`commands.ts`): `{commands: []}` without `harness.commands`; mcpUrl passed only when `capabilities.mcp === 'http'`
- `createSessionBus` (`session-bus.ts`): empty listener sets are deleted; `events` unlistens on abort, cancel and finally
- `session-rows.ts`: rows are validated with `SessionRecordSchema.parse`; default ids are `conciv_<uuid>`
- `claimNativeRow` (`session-rows.ts`): insert onConflictDoNothing on (harnessKind, cwd, harnessSessionId), then re-read
- `resolveRow` (`session-rows.ts`): conciv id, then harness id, then latest non-deleted chat row for the cwd (by realpath), then a new id
- `listSessionMetas` (`session-rows.ts`): skips invalid rows, filters by cwd and deletedAt unless `includeHidden`, materializes unclaimed native sessions

## Side Effects

- `session-rows.ts`: SQLite reads and writes on `sessions`; reads `chatThreads` message counts
- `listSessionMetas` (`session-rows.ts`): inserts or undeletes rows while listing; `logError` for invalid rows
- `listCommands` (`commands.ts`): calls the harness adapter's `commands`

## Verification

- Run: `cd packages/core && pnpm test`
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
