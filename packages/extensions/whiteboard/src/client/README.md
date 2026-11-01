# whiteboard/src/client

## Overview

`overlay.tsx` mounts the whiteboard only when the surface is engaged and a chat session id exists. It wraps everything in `WhiteboardDbProvider`, which builds TanStack DB collections (comments, pins, reads, canvasPending, canvasReplies, live and draft canvas elements) backed by the whiteboard oRPC router. `change-feed.ts` keeps one streaming `changes` subscription open and fans its events out to per-table handlers, reconnect handlers and cursor handlers. `canvas-surface.tsx` (lazy-loaded) renders the Excalidraw `Island` plus the comment pins, thread popover, inbox and compose dialog from the `model` and `pins` subdirectories.

## Interface

- `createChangeFeed(apiBase, room)` (`change-feed.ts`): opens the whiteboard `changes` stream and returns `subscribe(table, handler)`, `onReconnect`, `onCursor` and `close`
- `ChangeMessage` / `ChangeFeed` (`change-feed.ts`): upsert/delete message union and the feed's return type
- `sleep(ms, signal)` (`change-feed.ts`): delay that resolves early when the signal aborts
- `whiteboardCollectionOptions(deps)` (`whiteboard-collection.ts`): TanStack DB collection options for id-keyed tables; `onInsert`/`onUpdate`/`onDelete` call the table's `insert`/`update`/`remove` RPCs and write the server row back into the collection
- `whiteboardElementOptions(deps)` (`whiteboard-collection.ts`): collection options for `canvasElements`/`canvasDraftElements`, keyed by `elementId`, with throttled `utils.write` and `utils.cleanupStrategy`
- `WhiteboardClient` (`whiteboard-collection.ts`): `RouterClient<WhiteboardRouter>` type (the router type is imported from `../server/router.js`)
- `createWhiteboardDb(apiBase, room)` / `WhiteboardDb` (`db.tsx`): builds every collection plus a `cursors` signal, `postCursor`, `bulkUpsertElements`, `accountId` and `dispose`
- `WhiteboardDbProvider` / `useWhiteboardDb` (`db.tsx`): Solid context provider and accessor for the db
- `WhiteboardSurface({state})` (`overlay.tsx`): top-level overlay component, rendered when `state.engaged()` is true
- `CanvasSurface` (default export, `canvas-surface.tsx`): mounts `CommentsProvider`, the Excalidraw `Island`, `PinsLayer`, `ThreadPopover`, `InboxToggle`, `Inbox` and `Compose`
- `Inbox` / `InboxToggle` (`inbox.tsx`): comments inbox panel with search, sort, show-resolved filter and mark-all-read, plus its toggle button with an unread count
- `Self`, `CommentPick`, `SurfaceState` (`surface-types.ts`): identity, picked-element and surface-state types shared with the host
- `Avatar`, `Tooltip`, `Menu`, `MenuItem`, `MenuCheckboxItem`, `MenuRadioGroup`, `MenuRadioItem`, `MenuSeparator`, `Tabs`, `TabItem` (`ui.tsx`): thin wrappers over `@conciv/ui-kit-system` primitives
- Subdirectories:
  - [pins](./pins/README.md): Solid components for comment pins on the canvas: the draggable pin layer, the thread popover, the new-comment compose dialog and the source-drift drag prompt.
  - [model](./model/README.md): `comments.tsx` holds the Solid comments model: live queries over the comments, pins and reads collections, plus thread, unread, compose, pin and inbox state, exposed through `CommentsProvider`/`useComments`.

## Invariants

- `createChangeFeed` (`change-feed.ts`) re-subscribes after any stream end or error, waiting `RESUBSCRIBE_DELAY_MS` = 250 ms, and stops once `close()` aborts; calls use `retry: Number.POSITIVE_INFINITY`
- `createChangeFeed` (`change-feed.ts`) routes events whose `table === 'cursor'` only to cursor handlers, never to table handlers
- `buildSync` in `whiteboardCollectionOptions` (`whiteboard-collection.ts`) buffers feed messages until the initial `list` load commits, then replays the buffer; on reconnect it reloads with `truncate()`
- `whiteboardCollectionOptions` (`whiteboard-collection.ts`) writes an upsert as `update` when the key already exists and as `insert` otherwise; `confirmDelete` skips keys that are not in the collection
- `whiteboardElementOptions` (`whiteboard-collection.ts`) throttles element writes to `ELEMENT_WRITE_THROTTLE_MS` = 50 ms (leading and trailing); a single-row batch uses `elements.upsert`, larger batches use `elements.bulkUpsert`
- `whiteboardElementOptions` (`whiteboard-collection.ts`): on a defined `CONFLICT` error from `elements.upsert` it writes `error.data.current` into the collection; any other error is rethrown
- `useWhiteboardDb` (`db.tsx`) throws 'useWhiteboardDb must be used inside a WhiteboardDbProvider' when the context is missing
- `createWhiteboardDb` (`db.tsx`) parses every feed row with zod schemas (`commentRow`, `pinRow`, `readRow`, `pendingRow`, `replyRow`, `elementRow`) imported from `../shared/rows.js`
- `WhiteboardSurface` / `Board` (`overlay.tsx`) renders `SessionPending` until `useSessionId()` returns a value, and keys the db provider on the session
- `CanvasView` (`canvas-surface.tsx`) closes the canvas on Escape only when the canvas is visible, no thread/compose/inbox is open, and the key event target is outside `.excalidraw`
- `Inbox` (`inbox.tsx`) filters threads by a case-insensitive substring match against every comment's text and display name in the thread

## Side Effects

- Network: `createChangeFeed` (`change-feed.ts`) keeps a long-lived oRPC `changes` stream to the `whiteboard` extension at `apiBase`, scoped to the room
- Network: collection mutations (`whiteboard-collection.ts`) call the `comments`/`pins`/`reads`/`canvasPending`/`canvasReplies` `list`/`insert`/`update`/`remove` RPCs and `elements.list`/`upsert`/`bulkUpsert`/`bulkDelete`
- Network: `postCursor` (`db.tsx`) sends the `cursor` RPC and ignores failures
- localStorage: `accountId` (`db.tsx`) reads or creates the key `conciv-whiteboard-account-id`
- sessionStorage: `selfIdentity` in `WhiteboardSurface` (`overlay.tsx`) reads or creates the key `conciv-whiteboard-presence-id`
- DOM: `CanvasSurface` (`canvas-surface.tsx`) injects the Excalidraw CSS once as a `<style data-whiteboard-style>` in `document.head`
- DOM: `CanvasView` (`canvas-surface.tsx`) adds a capture-phase `keydown` listener on the window
- Host UI: `CanvasSurface` (`canvas-surface.tsx`) shows the toast 'Comment added to the whiteboard' when a comment is added while the canvas is closed; `OverlayError` (`overlay.tsx`) shows the error toast 'The whiteboard needs a running conciv server'
- Lifecycle: `WhiteboardDbProvider` (`db.tsx`) calls `dispose()` on cleanup, which clears the throttle strategies and closes the feed

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-whiteboard` from the repo root (turbo builds the package and its dependencies first)
