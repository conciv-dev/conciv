# ai/src/session

## Overview

The Solid client-side chat session. It wraps `useChat` from `@tanstack/ai-solid` with run lifecycle tracking, hydration, stop, approval decisions and queue flushing, over a connection the caller supplies.

## Interface

- `session.ts:createChat` - returns `useChat(options)`.
- `session.ts:createChatSession` - returns a `ChatSession` with `stop`, `refresh`, `interruptAndFlush`, `decide` and accessors `stopping`, `stopped`, `runSource`, `runError`, `sessionRunning`, `runInProgress`, `loadFailed`, `pendingApprovals`, and `harnessOf(messageId)`.
- `session.ts:CreateChatSessionOptions` - `sessionId`, `connect(callbacks)`, `stop(runIds)`, `decide(approvalId, approved, scope)`, optional `onError`.
- `session.ts:ChatSessionConnection` - a `SubscribeConnectionAdapter` plus `refresh(before?)` (the newest page, or the page before a cursor) and `close()`.
- `session.ts:ChatSessionCallbacks` - `onLifecycle`, `onHydrated`, `onRunError`, `onApprovalAsk`, `joinsRun`.
- `session.ts:ChatSessionHydration` / `ChatApprovalScope` (`'once' | 'session'`) / `Chat` / `CreateChatOptions` - exported types.

## Invariants

- `session.ts:newerRun` - hydration does not overwrite a run that started later, or the same run when it is already terminal.
- `session.ts:harnessOf` - the harness that produced a message, by message id, merged from every hydration's `messageHarness`; `undefined` for a message no hydration named.
- `session.ts:loadFailed` - the history load failed when the chat holds no messages but an error; the loading state itself is `useChat`'s `isHydrating`, which goes false on success or failure.
- `session.ts:onApprovalAsk` - pending approvals are deduplicated by `approvalId`.
- `session.ts:joinedRun` - does not join a run the local chat owns (loading, or the same `runId`), nor any run while the chat's history load has failed: that chat is reopened, never patched, so its load error and Retry stay.
- `session.ts:stopRun` - always calls `chat.stop()` even if `options.stop` throws, then marks the run source `aborted` and refreshes.
- `session.ts:interruptAndFlush` - a newer stop request cancels the flush; all-text queues are joined with a newline into one message.
- `session.ts:decide` - sends a follow-up message (`Approved: ...`, `Approved for this session: ...` or `Denied: ...`) only when the server returns `startsTurn` and the ask was pending.
- `session.ts:createChatSession` - `useChat` is configured with `persistence: true`, `history: {pageSize: CHAT_HISTORY_PAGE_SIZE}` (50), `live: true`, `queue: 'queue'`.
- `session.ts:refresh` - stored message ids are the rendered ids, so a refresh stitches by id: messages shown before the refreshed page's first message stay in front of it. A page that starts past everything shown, an empty chat included, pulls the pages before it until it reaches a shown message (or the thread start), so loaded history is kept and the gap is filled.

## Side Effects

- `session.ts:createChatSession` - opens the connection through `options.connect` and closes it in `onCleanup`.
- `session.ts:stopRun` / `refresh` / `decide` - call the supplied network callbacks and `chat.sendMessage`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
