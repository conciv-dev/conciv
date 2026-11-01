# whiteboard/src/server

## Overview

router.ts builds an oRPC router that scopes every procedure to a room taken from the conciv session header and exposes list/insert/update/remove for comments, pins, reads, canvasPending and canvasReplies, plus element list/upsert/bulk operations, a cursor broadcast and an SSE change stream. context.ts defines the context object passed to whiteboard tool server handlers. auto-commit.ts queues a 'commit' pending row when draft elements exist. enrich-worker.ts listens for source-linked comment events and fills in anchor file/component/hash.

## Interface

- `makeWhiteboardRouter` (`router.ts`): builds the oRPC router with namespaces comments, pins, reads, canvasPending, canvasReplies (each list/insert/update/remove), elements (list/upsert/bulkUpsert/bulkDelete), cursor and changes
- `WhiteboardRouter` (`router.ts`): type of the router returned by makeWhiteboardRouter
- `WhiteboardToolContext` (`context.ts`): tool context type with cwd, store, sessionId(request), room(request), model(request)
- `autoCommitDraft` (`auto-commit.ts`): inserts a live 'commit' canvas_pending row for a room when it has draft elements and no pending commit; returns whether it inserted
- `startCommentEnrichment` (`enrich-worker.ts`): subscribes to store events and enriches source-linked comment anchors via enrichAnchor; returns an unsubscribe function
- Subdirectories:
  - [db](./db/README.md): Drizzle SQLite schema for seven whiteboard tables and a libSQL-backed store that runs migrations, performs room-scoped CRUD, and emits change events to in-process listeners.

## Invariants

- `serverRoom` (`router.ts`) throws ORPCError UNAUTHORIZED when the CONCIV_SESSION_HEADER header is missing or blank, and BAD_REQUEST when it fails isSessionId
- room/sessionId ownership is server-derived: patch schemas in `makeWhiteboardRouter` (`router.ts`) omit id and room/sessionId, and toRow overwrites them with the header room
- table update procedures in `makeWhiteboardRouter` (`router.ts`) reject an empty patch (refine: at least one mutable field) and throw NOT_FOUND when no row matches id+room
- `elements.upsert` in `makeWhiteboardRouter` (`router.ts`) throws CONFLICT with data.current when the stored element version is >= the incoming version
- `changes` in `makeWhiteboardRouter` (`router.ts`) only emits store events whose room equals the caller's room
- `autoCommitDraft` (`auto-commit.ts`) returns false without inserting when there are no draft elements or a 'commit' pending row already exists for the room
- `startCommentEnrichment` (`enrich-worker.ts`) only enriches comments rows with kind 'source-linked', no anchorHash, an anchor matching {source:{file}}, and not already attempted; delete events clear the attempted id
- `enrichRow` (`enrich-worker.ts`) skips the update when enrichAnchor returns no hash

## Side Effects

- `makeWhiteboardRouter` (`router.ts`) reads and writes the whiteboard libSQL tables via store and db
- `cursor` procedure in `makeWhiteboardRouter` (`router.ts`) broadcasts cursor events to in-process store listeners
- `changes` procedure in `makeWhiteboardRouter` (`router.ts`) holds an event-iterator subscription on store.onEvent until the signal aborts
- `autoCommitDraft` (`auto-commit.ts`) inserts a row into canvas_pending
- `startCommentEnrichment` (`enrich-worker.ts`) registers a store listener and writes anchor, anchorFile, anchorComponent, anchorHash, updatedAt to comments rows

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
