# whiteboard/src/tool/comment

## Overview

def.ts declares the tool definitions with zod schemas, error codes (COMMENT_NOT_FOUND, PIN_NOT_FOUND) and approval flags. server.ts implements them against the comments and pins tables (../../server/db/schema.ts) through the WhiteboardToolContext store; queries are scoped by sessionId for comments and by room for pins. anchor-enrich.ts resolves a {source:{file,line,column}} anchor through loadResolver from ../../anchor/load-resolver.ts to capture file, component and hash. card.tsx renders comment tool calls in chat, and card.stories.tsx holds its Storybook stories.

## Interface

- `commentCreateDef`, `commentReplyDef`, `commentReadDef`, `commentListDef`, `commentResolveDef`, `commentDeleteDef`, `commentMoveDef`, `pinSetStateDef` (`def.ts`): tool definitions for comment_create, comment_reply, comment_read, comment_list, comment_resolve, comment_delete, comment_move, pin_set_state
- `commentTools` and the individual `commentCreateTool`, `commentReplyTool`, `commentReadTool`, `commentListTool`, `commentResolveTool`, `commentDeleteTool`, `commentMoveTool`, `pinSetStateTool` (`server.ts`): server-bound tools
- tool `comment_create` (`server.ts`): inserts an open root comment (threadId = cid) with an enriched anchor, plus a 'locked' pin at x/y in the room
- tool `comment_reply` (`server.ts`): inserts a floating reply with a new UUID cid in the parent's thread; authorKind defaults to 'ai'
- tool `comment_read` (`server.ts`): returns the comment and its replies sorted by createdAt
- tool `comment_list` (`server.ts`): returns top-level session comments, optionally filtered by anchorFile and status
- tool `comment_resolve` / `comment_delete` / `comment_move` / `pin_set_state` (`server.ts`): set status resolved; delete comment or whole thread plus pin; update pin x/y; set pinState locked|offset
- `enrichAnchor` / `EnrichedAnchor` (`anchor-enrich.ts`): returns the captured anchor plus file/component/hash, falling back to the raw anchor's source fields
- `CommentOpCard` / `commentOpCard` (`card.tsx`): Solid ToolCardView showing the op tag, summary, text preview of parts, thread rows and errors
- Storybook stories `CreatePreview`, `ListResults`, `ReadThread`, `ResolveConfirmed`, `DeleteConfirmed`, `PinLocked`, `NotFound` (`card.stories.tsx`)

## Invariants

- `commentByCid` throws COMMENT_NOT_FOUND when no comment matches sessionId+cid (`server.ts`)
- `pinByCid` throws PIN_NOT_FOUND when no pin matches room+cid (`server.ts`)
- comment_delete removes every comment in the thread and the room's pins for that cid only when the comment is a thread root (threadId === cid); otherwise it removes only that comment (`server.ts`)
- comment_resolve and comment_delete declare approval 'ask' (`def.ts`)
- comment_list status filter is limited to open|resolved|drifted|orphaned and scope to session|all (`commentListDef`, `def.ts`); the handler always filters by the current sessionId regardless of scope (`server.ts`)
- markPresence throttles agent cursor updates to one per AGENT_THROTTLE_MS=50 per session+peer (`server.ts`)
- `enrichAnchor` skips resolution when the anchor fails the PickAnchor schema or cwd is '' and falls back on any resolver error (`anchor-enrich.ts`)
- `CommentOpCard` marks resolve and delete ops with tone 'danger' (DESTRUCTIVE set, `card.tsx`)

## Side Effects

- DB inserts/updates/deletes on tables comments and pins through ctx.store.insertComment/updateComment/deleteComment/insertPin/updatePin/deletePin (`server.ts`)
- Broadcasts an agent cursor (peerId 'agent:<model>', color #19c3b2) through ctx.store.cursor from comment_create, comment_reply and comment_move (`markPresence`, `server.ts`)
- Module-global lastPresence Map for throttling (`server.ts`)
- Loads the source anchor resolver and reads project source under ctx.cwd through loadResolver().capture (`enrichAnchor`, `anchor-enrich.ts`)
- DOM rendering of the chat tool card in `CommentOpCard` (`card.tsx`)

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
