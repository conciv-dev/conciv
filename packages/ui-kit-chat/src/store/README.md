# store

## Overview

Chat state and pure derivations: the `ChatProvider` context with view state, turn coalescing and part grouping, page-session grouping, turn rollups, session status, run clock and the tool view context.

## Interface

- `chat-context.tsx:ChatProvider`, `useChatContext`, `useChatContextOptional`, `useThread`, `useComposer`; types `Chat`, `ChatContextValue`, `ViewState`.
- `grouping.ts:coalesceTurns`, `buildGroupTree`, `groupParts`, `groupPartByType`, `defaultGrouper`, `stickyGrouper`, `pairResults`, `childCallsFor`, `parentToolCallIdOf`, `standaloneToolNames`, `isReplyText`, `CHAIN_GROUP_KEY` (`group-chain`), `PAGE_SESSION_GROUP_KEY` (`group-page-session`); types `Turn`, `Grouper`, `Grouping`, `GroupNode`, `GroupEntry`.
- `page-session.ts:createPageSessionGrouper`, `createGrouping`, `pageSessionCallParts`, `pageSessionThinkingParts`.
- `turn-rollup.ts:turnRollup`, `createTurnRollup`, `summaryLine`, `sessionTotals`; `session-status.ts:deriveSessionStatus`, `createSessionStatus`; `run-clock.ts:runClock`, `createRunClock`, `formatElapsed`; `active-call.ts:activeToolCall`, `activeCallInParts`.
- `tool-context.tsx:ToolProvider`, `useToolCtx`, `INERT_TOOL_CTX`, `INERT_ADD_RESULT`.

## Invariants

- `chat-context.tsx:useChatContext` throws `useChatContext must be used within a <ChatProvider>`; `ChatProvider` re-mounts its scope when the `chat` object changes (`Show keyed`).
- `chat-context.tsx:ChatScope` prunes `view.collapsed` to live tool-call ids and `view.pinned` to live message ids on every messages change.
- `chat-context.tsx:useComposer().send` trims the draft, clears it, then calls `sendMessage`; it does nothing when the trimmed draft is empty.
- `grouping.ts:coalesceTurns` merges consecutive assistant messages into one `Turn`.
- `grouping.ts:defaultGrouper` places `text`/`image`/standalone tool calls at the root and `thinking`/`tool-call` in the chain group, and drops blank or model-only parts.
- `session-status.ts:deriveSessionStatus` precedence: stopping, waiting (approval), running, failed, stopped, done.
- `run-clock.ts:createRunClock` polls every `RUN_CLOCK_POLL_MS` (1000) only while the run phase is not terminal; a finished run reports a frozen elapsed time.

## Side Effects

- `chat-context.tsx:useComposer` writes `view.draft` and calls `chat.sendMessage` / `chat.stop`.
- `run-clock.ts:createRunClock` runs a `createPolled` timer while a run is live.

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
