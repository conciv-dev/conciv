# ai/src/session

## Overview

The Solid client-side chat session. It wraps `useChat` from `@tanstack/ai-solid` with run lifecycle tracking, hydration, stop, approval decisions and queue flushing, over a connection the caller supplies.

## Interface

- `session.ts:createChat` - returns `useChat(options)`.
- `session.ts:createChatSession` - returns a `ChatSession` with `stop`, `refresh`, `interruptAndFlush`, `decide` and accessors `stopping`, `stopped`, `runSource`, `runError`, `sessionRunning`, `runInProgress`, `hydrated`, `pendingApprovals`.
- `session.ts:CreateChatSessionOptions` - `sessionId`, `connect(callbacks)`, `stop(runIds)`, `decide(approvalId, approved, scope)`, optional `onError`.
- `session.ts:ChatSessionConnection` - a `SubscribeConnectionAdapter` plus `refresh()` and `close()`.
- `session.ts:ChatSessionCallbacks` - `onLifecycle`, `onHydrated`, `onRunError`, `onApprovalAsk`, `joinsRun`.
- `session.ts:ChatSessionHydration` / `ChatApprovalScope` (`'once' | 'session'`) / `Chat` / `CreateChatOptions` - exported types.

## Invariants

- `session.ts:newerRun` - hydration does not overwrite a run that started later, or the same run when it is already terminal.
- `session.ts:onApprovalAsk` - pending approvals are deduplicated by `approvalId`.
- `session.ts:joinedRun` - does not join a run the local chat owns (loading, or the same `runId`).
- `session.ts:stopRun` - always calls `chat.stop()` even if `options.stop` throws, then marks the run source `aborted` and refreshes.
- `session.ts:interruptAndFlush` - a newer stop request cancels the flush; all-text queues are joined with a newline into one message.
- `session.ts:decide` - sends a follow-up message (`Approved: ...`, `Approved for this session: ...` or `Denied: ...`) only when the server returns `startsTurn` and the ask was pending.
- `session.ts:createChatSession` - `useChat` is configured with `persistence: true`, `live: true`, `queue: 'queue'`.

## Side Effects

- `session.ts:createChatSession` - opens the connection through `options.connect` and closes it in `onCleanup`.
- `session.ts:stopRun` / `refresh` / `decide` - call the supplied network callbacks and `chat.sendMessage`.

## Verification

- Run: `cd packages/ai && pnpm test`
- Run: `cd packages/ai && pnpm typecheck`
