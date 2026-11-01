# whiteboard/src/client/model

## Overview

`createCommentsModel` reads the comments, pins and reads collections from `useWhiteboardDb` through `useLiveQuery`. On top of them it computes threads, participants, unread state and inbox ordering. It writes comments, replies, pins, read markers, resolve state and deletions back to those collections, and it tracks UI signals for the open thread, compose target, viewport and inbox. `CommentsProvider` creates the model once and wraps its children in the host's `Suppress` while a thread or compose dialog is open.

## Interface

- `createCommentsModel(room, apiBase, canvasOpen, onComposeSettled)` (`comments.tsx`): builds the model; returns accessors and actions such as `orderedThreads`, `threadOf`, `isUnread`, `markRead`, `markAllRead`, `openThread`, `closeThread`, `stepThread`, `movePin`, `detachAnchor`, `startCompose`, `cancelCompose`, `createComment`, `reply`, `resolve`, `deleteThread`, `removeComment`, `anchorRect`, `panToThread`, `registerPan`, `registerPin`
- `CommentsProvider` (`comments.tsx`): context provider that also wraps children in the host `Suppress` component
- `useComments()` (`comments.tsx`): context accessor
- `CommentsModel`, `Comment`, `Pin`, `Participant`, `CommentSource`, `ComposeTarget`, `Rect` (`comments.tsx`): model and data types (`Comment`/`Pin` alias `CommentRow`/`PinRow` from `../../shared/rows.js`)

## Invariants

- `useComments` (`comments.tsx`) throws 'useComments must be used inside a CommentsProvider' when the context is missing
- `isUnread` (`comments.tsx`) counts only comments not owned by the current account, and returns true when no read marker exists or the newest such comment is later than `lastReadAt`
- `markRead` (`comments.tsx`) does nothing without an account id; it updates the existing read row for that thread and account, or inserts one
- `orderedThreads` (`comments.tsx`) lists root comments only (no `parentId`), hides `resolved` ones unless `showResolved` is on, sorts newest first, and in `unread` mode moves unread threads to the top
- `reply` (`comments.tsx`) does nothing when no thread is open or there are no segments
- `createComment` (`comments.tsx`) inserts the root comment (`threadId = cid`, `status 'open'`, `kind 'source-linked'` when a source exists, otherwise `'floating'`) and a pin in state `'locked'` placed at the target converted to scene coordinates; it opens the thread only when `canvasOpen()` is true
- `removeComment` (`comments.tsx`) deletes the whole thread, including its pin, when the comment is the thread root (`cid === threadId`)
- `anchorRect` (`comments.tsx`) tries the pin element rect, then the pin's scene position, then the pending anchor; if all are missing it logs a `console.warn` while a thread is open
- `stepThread`/`canStep` (`comments.tsx`) only move when the open thread is in `orderedThreads` and the target index exists
- `ownedBySelf` (`comments.tsx`) is true only for `authorKind === 'human'` comments whose `authorId` equals the account id

## Side Effects

- Collection writes (synced to the server through `../db.js`): `createComment`, `reply`, `resolve`, `deleteThread`, `removeComment`, `detachAnchor`, `movePin`, `markRead` (`comments.tsx`) insert, update or delete rows in `db.comments`, `db.pins` and `db.reads`
- Host UI: `CommentsProvider` (`comments.tsx`) turns on the extension API `Suppress` while `openCid` or `composeTarget` is set
- Console: `anchorRect` (`comments.tsx`) logs a `console.warn` when an open thread has no anchor

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
