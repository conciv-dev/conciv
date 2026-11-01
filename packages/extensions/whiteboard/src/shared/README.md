# whiteboard/src/shared

## Overview

meta.ts defines `WHITEBOARD_NAME` and the `WHITEBOARD_PROMPT` system prompt, which sets the draft, preview, export and commit drawing loop and the style rules. rows.ts defines zod schemas for element, pending, reply, comment, pin and read rows and for cursor events. It also defines insert variants without the room or session key, a recursive `json` schema, and their inferred types. Both entry points and the server store, router, collections and island import from here.

## Interface

- `WHITEBOARD_NAME` = 'whiteboard', `WHITEBOARD_PROMPT` (`meta.ts`)
- `json`, type `JsonValue` (`rows.ts`): recursive JSON zod schema
- `elementRow`, `pendingRow`, `replyRow`, `commentRow`, `pinRow`, `readRow`, `cursorEvent` (`rows.ts`) and their inferred types `ElementRow`, `PendingRow`, `ReplyRow`, `CommentRow`, `PinRow`, `ReadRow`, `CursorEvent`
- `elementRowInsert`, `pendingRowInsert`, `replyRowInsert`, `pinRowInsert`, `cursorEventInsert` (omit `room`), `commentRowInsert`, `readRowInsert` (omit `sessionId`) and their `*Insert` types (`rows.ts`)
- `elementRowToInsert(row)` (`rows.ts`): drops `room`

## Invariants

- `pendingRow.kind` (`rows.ts`): one of 'skeletons'|'mermaid'|'svg'|'export'|'commit'|'discard'; `stage` is 'draft'|'live'
- `replyRow.kind` (`rows.ts`): only 'export'
- `commentRow` (`rows.ts`): `authorKind` is 'human'|'ai', `status` is 'open'|'resolved'|'drifted'|'orphaned', `kind` is 'source-linked'|'floating', and timestamps are integers
- `pinRow.pinState` (`rows.ts`): 'locked'|'offset'
- `cursorEvent.kind` (`rows.ts`): 'human'|'agent'; `lastSeen` is an integer
- `elementRow.version` (`rows.ts`): an integer

## Side Effects

- None

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
