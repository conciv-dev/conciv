# store

## Overview

Chat state and pure derivations: the `ChatProvider` context with view state, turn coalescing and part grouping, page-session grouping, turn rollups, session status, run clock and the tool view context.

## Interface

- `chat-context.tsx:ChatProvider`, `useChatContext`, `useChatContextOptional`, `useThread`, `useComposer`; types `Chat`, `ChatContextValue`, `ViewState`, `TurnItem`.
- `turn-parts.ts:createTurnParts` - one turn's parts keyed by tool-call id, tool-result call id or position, with per-call `resultFor` and `hidesResult` lookups that wake only the row whose result arrives.
- `grouping.ts:coalesceTurns`, `buildGroupTree`, `groupParts`, `groupPartByType`, `defaultGrouper`, `stickyGrouper`, `pairResults`, `childCallsFor`, `parentToolCallIdOf`, `standaloneToolNames`, `isReplyText`, `CHAIN_GROUP_KEY` (`group-chain`), `PAGE_SESSION_GROUP_KEY` (`group-page-session`); types `Turn`, `Grouper`, `Grouping`, `GroupNode`, `GroupEntry`.
- `page-session.ts:createPageSessionGrouper`, `createGrouping`, `pageSessionCallParts`, `pageSessionThinkingParts`.
- `turn-rollup.ts:turnRollup`, `createTurnRollup`, `summaryLine`, `sessionTotals`; `session-status.ts:deriveSessionStatus`, `createSessionStatus`; `run-clock.ts:runClock`, `createRunClock`, `formatElapsed`; `active-call.ts:activeToolCall`, `activeCallInParts`.
- `tool-context.tsx:ToolProvider`, `useToolCtx`, `INERT_TOOL_CTX`, `INERT_ADD_RESULT`.

## Invariants

- `chat-context.tsx:useChatContext` throws `useChatContext must be used within a <ChatProvider>`; `ChatProvider` re-mounts its scope when the `chat` object changes (`Show keyed`).
- `chat-context.tsx:ChatScope` groups messages into turns once and keys them by turn key: `useThread().turns` is a list of `TurnItem`s whose array and items keep their identity while a chunk only changes a part, so only the `turn` accessor of the changed turn wakes.
- `chat-context.tsx:useComposer().send` trims the draft, clears it, then calls `sendMessage`; it does nothing when the trimmed draft is empty.
- `grouping.ts:coalesceTurns` merges consecutive assistant messages into one `Turn`; a message whose metadata parses as `CompactionMetadataSchema` (`@conciv/protocol/chat-message-types`) opens a new `Turn`, so compaction output never joins the reply before it. An assistant message also opens a new `Turn` when the `run` of its first tool call's outside-call marker (`OutsideCallMetadataSchema`) differs from the message before it, so each outside agent call gets its own turn; messages without a `run` merge as before. `isOutsideTurn(turn)` answers from the same marker; `styled/thread.tsx` uses it to render consecutive outside-call turns as one open list (no fold, no action row, headless `Trace` joined to its neighbours).
- `grouping.ts:diffTurns` reuses a previous turn only when its messages keep the same ids, roles and parts at the same positions, so a prepended page never inherits a newer turn's key.
- `grouping.ts:defaultGrouper` places `text`/`image`/standalone tool calls at the root and `thinking`/`tool-call` in the chain group, and drops blank or model-only parts.
- `session-status.ts:deriveSessionStatus` precedence: stopping, waiting (approval), running, failed, stopped, done.
- `run-clock.ts:createRunClock` polls every `RUN_CLOCK_POLL_MS` (1000) only while the run phase is not terminal; a finished run reports a frozen elapsed time.

## Side Effects

- `chat-context.tsx:useComposer` writes `view.draft` and calls `chat.sendMessage` / `chat.stop`.
- `run-clock.ts:createRunClock` runs a `createPolled` timer while a run is live.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
