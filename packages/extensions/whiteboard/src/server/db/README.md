# whiteboard/src/server/db

## Overview

schema.ts declares the drizzle tables canvas_elements, canvas_draft_elements, canvas_pending, canvas_replies, comments, pins and reads. store.ts opens a file database at <dataDir>/whiteboard.db, applies migrations from the package drizzle folder, and returns functions for element upserts with version checks and room-scoped insert/update/delete on the other tables. Every successful write emits a WhiteboardEvent to registered listeners, and cursor events are broadcast without being stored.

## Interface

- `canvasElements` (`schema.ts`): sqliteTable 'canvas_elements' (room, element_id, data json, version; composite PK room+element_id)
- `canvasDraftElements` (`schema.ts`): sqliteTable 'canvas_draft_elements', same shape as canvas_elements, for draft scope
- `canvasPending` (`schema.ts`): sqliteTable 'canvas_pending' (id, room, kind enum skeletons|mermaid|svg|export|commit|discard, stage enum draft|live default live, payload json)
- `canvasReplies` (`schema.ts`): sqliteTable 'canvas_replies' (id, room, request_id, kind enum export, payload json)
- `comments` (`schema.ts`): sqliteTable 'comments' (session_id, cid, thread_id, parent_id, parts json, author fields, status open|resolved|drifted|orphaned default open, kind source-linked|floating, anchor json, anchor_file, anchor_component, anchor_hash, created_at, updated_at, resolved_at)
- `pins` (`schema.ts`): sqliteTable 'pins' (room, cid, x, y, element_id, pin_state locked|offset default locked, anchor_x, anchor_y)
- `reads` (`schema.ts`): sqliteTable 'reads' (session_id, thread_id, account_id, last_read_at)
- `createStore` (`store.ts`): async factory returning db, onEvent, cursor, element list/upsert/delete functions, insert/update/delete for comments, pins, reads, pending and replies, and close
- `Store` (`store.ts`): type of the object returned by createStore
- `WhiteboardChange` / `WhiteboardEvent` (`store.ts`): upsert/delete change event per table, plus a 'cursor' event
- `ElementScope` / `ElementUpsert` (`store.ts`): 'live'|'draft' scope and the {ok,row}|{ok:false,current} upsert result

## Invariants

- `upsertElement` in `createStore` (`store.ts`) rejects the write and returns {ok:false,current} when the stored version is >= row.version
- scope 'draft' maps to canvas_draft_elements and 'live' to canvas_elements via `elementTable` in `createStore` (`store.ts`)
- update/delete functions in `createStore` (`store.ts`) match on both id and room (sessionId for comments and reads) and return undefined/false when no row matches
- events are emitted only after a successful write; delete events only when rowsAffected > 0 or a row was returned (`createStore`, `store.ts`)
- `upsertElements` / `deleteElements` in `createStore` (`store.ts`) process rows one at a time in order; conflicting rows return the current stored row
- `resolveMigrationsFolder` in `store.ts` tries ../../../drizzle, ../drizzle, ../../drizzle and falls back to ../../../drizzle
- canvas_elements and canvas_draft_elements use a composite primary key (room, element_id) (`schema.ts`)

## Side Effects

- `createStore` (`store.ts`) creates dataDir recursively and opens/creates the libSQL file whiteboard.db in it
- `createStore` (`store.ts`) runs drizzle migrations against the database on startup
- `createStore` (`store.ts`) functions read and write the canvas_elements, canvas_draft_elements, canvas_pending, canvas_replies, comments, pins and reads tables
- `createStore` (`store.ts`) keeps an in-memory listener set and calls every listener on each write or cursor event
- `close` from `createStore` (`store.ts`) closes the libSQL client

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
