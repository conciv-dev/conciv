# ai/src

## Overview

The three entry modules of `@conciv/ai`. `client.ts` and `server.ts` re-export the session, server and adapter primitives from the subdirectories; `testkit.ts` provides scripted chat event streams for tests and stories.

## Interface

- `client.ts` - re-exports `createChat`, `createChatSession` and session types from `./session/session.js`, plus `fetchServerSentEvents` and `webSocket` from `@tanstack/ai-client`.
- `server.ts` - re-exports `approvalNeeded`, `createChatServer`, `toolApprovalId`, `childCardChunks`, `imageBlocks`, `imageToolProvisioner`, `imagesIn`, `withoutImages`, `drizzleChatStores` and the `chatMetadata` / `chatRuns` / `chatThreads` tables.
- `server.ts` - re-exports the adapters `acp`, `claudeCode`, `codex`, `codexModels`, `makeTextAdapter`, `opencode`, `opencodeModels` and the types `TextAdapter`, `Approvals`, `ChatStores`, `TurnHooks`.
- `testkit.ts:storyConnection` - a `ConnectConnectionAdapter` that yields RUN_STARTED, the scripted chunks, then RUN_FINISHED or RUN_ERROR, or waits until aborted.
- `testkit.ts:createTextChunks` / `createReasoningChunks` / `createToolCallChunks` / `createToolResultChunk` / `createApprovalChunk` - build scripted chat events.
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
