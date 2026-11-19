# ai/src

## Overview

The three entry modules of `@conciv/ai`. `client.ts` and `server.ts` re-export the session, server and adapter primitives from the subdirectories; `testkit.ts` provides scripted chat event streams for tests and stories.

## Interface

- `client.ts` - re-exports `createChat`, `createChatSession` and session types from `./session/session.js`, plus `rpcStream` and `StreamReconnectLimitError` from `@tanstack/ai-client`.
- `server.ts` - the chat server (`createChatServer`, `drizzleChatStores`, the asking tool provisioner, code mode drivers), the harness text adapters, and `createMCPServer` / `createMCPClient` from `@tanstack/ai-mcp`. The chat tables live in `@conciv/db`; import them from there. `TurnHooks.admit(turn)` runs first and refuses a turn by rejecting.
- `testkit.ts:storyConnection` - a `ConnectConnectionAdapter` that yields RUN_STARTED, the scripted chunks, then RUN_FINISHED or RUN_ERROR, or waits until aborted.
- `testkit.ts:createTextChunks` / `createReasoningChunks` / `createToolCallChunks` / `createToolResultChunk` - build scripted chat events.
- `testkit.ts:runAdapterTurn` - runs `chat()` against an adapter with threadId `testkit` and collects the events.
- `testkit.ts:foldChatEvents` - folds events into `ChatMessage[]` using `StreamProcessor`.
- Subdirectories: [adapters](./adapters/README.md), [server](./server/README.md), [session](./session/README.md).

## Invariants

- `testkit.ts:scriptedChunks` - stops yielding once the abort signal is aborted.
- `testkit.ts:runEnd` - yields nothing if aborted; with `shouldError` it emits RUN_ERROR (`Story stream error` by default) instead of RUN_FINISHED.

## Side Effects

- `testkit.ts:sleep` - sets a `setTimeout` per chunk when `chunkDelay > 0` and clears it on abort.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
