# whiteboard/src

## Overview

Both entries call `defineExtension` from @conciv/extension with the same name (`WHITEBOARD_NAME`) and system prompt (`WHITEBOARD_PROMPT`). server.ts registers the canvas, comment, anchor and element tool sets. In its server hook it creates the store, starts comment enrichment, returns the tool context and router, and auto-commits the draft when a turn ends. client.tsx adds two composer action buttons (toggle whiteboard, comment on element) and a Surface that renders `WhiteboardSurface`. It holds the open, engaged and pick-phase state in a Solid root. css-inline.d.ts declares the `*.css?inline` module type.

## Interface

- default export (`server.ts`): server extension with tools `[...canvasTools, ...commentTools, ...anchorTools, ...elementTools]`. Its context is `{cwd, store, sessionId, room: sessionId, model}`, its router is `makeWhiteboardRouter(store)`, and it has `turnEnd` and `dispose`
- default export `whiteboard` (`client.tsx`): client extension with `tools: whiteboardToolClients`, `Component` and `Surface`. Its context value is `{toggle, open, engaged, visible, close, comment, pickStarted, pickAborted, settleCompose, registerComment}`
- `Component` (`client.tsx`): renders only when `slot === 'composer'`. It has two `ComposerActions.ActionButton`s: priority 20 opens the canvas and priority 19 runs `grab.comment()` and then `comment({source, rect})`
- module `*.css?inline` (`css-inline.d.ts`): default export string
- Subdirectories:
  - [server](./server/README.md): Server-side wiring for the whiteboard extension: an oRPC router over the local drizzle store, the tool context type, a draft auto-commit helper and a comment-anchor enrichment listener.
  - [shared](./shared/README.md): Code shared by server and client: the extension name and system prompt, plus zod row schemas and types for every whiteboard table and the cursor event.
  - [canvas](./canvas/README.md): Browser-side Excalidraw integration. It mounts Excalidraw as a React island inside Solid, syncs scene elements with the TanStack DB collections, and drains agent pending ops (skeletons, mermaid, svg, commit, export). It also holds helpers for SVG conversion, commit replay and coordinate mapping.
  - [anchor](./anchor/README.md): Server-side source anchoring for JSX elements. It captures a file/line/column as a structural hash using oxc-parser and resolves it later with git-aware relocation. File reads are confined to the project root and secrets are redacted.
  - [client](./client/README.md): Browser-side whiteboard runtime: an oRPC change feed, TanStack DB collections synced over that feed, the Solid overlay and canvas surface mount, and shared UI wrappers.
  - [tool](./tool/README.md): Client registry of all whiteboard tools paired with their chat cards, plus shared card UI helpers and Storybook fixtures.

## Invariants

- `visible` (`client.tsx`): the surface is visible only when `open()` is true and `pickPhase()` is 'idle'
- `registerComment` (`client.tsx`): it keeps a single writer, replacing earlier ones, and flushes comments queued in `pendingComments` before any writer registered
- `comment` (`client.tsx`): it sets the pick phase to 'composing'. With no registered writer it queues the pick
- `pickComment` (`client.tsx`): if `grab.comment()` rejects or returns null, it calls `pickAborted` and the phase goes back to 'idle'
- `toggle` (`client.tsx`): it always resets the pick phase to 'idle' and sets `engaged`
- `room` (`server.ts`): the room is the request's sessionId, so there is one canvas per chat session

## Side Effects

- `createStore(join(server.stateDir, 'whiteboard'))` (`server.ts`): opens and migrates the libSQL db on disk under stateDir/whiteboard
- `startCommentEnrichment` (`server.ts`): starts a background enrichment worker, which `dispose` stops before `store.close()`
- `turnEnd` (`server.ts`): calls `autoCommitDraft(store, sessionId)` without awaiting it and logs failures with console.error
- `createRoot` (`client.tsx`): creates a module-level Solid reactive root, which is disposed through the returned `dispose`

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
