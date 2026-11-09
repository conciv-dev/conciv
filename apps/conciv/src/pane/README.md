# pane

## Overview

The chat pane for one session: transcript, composer with attachments and element grabs, drafts persisted over rpc, send checks, queue strip, pending approvals, context usage tracker, status bar with view tabs, and refresh.

## Interface

- `ChatPane({sessionId, viewTab?})` (`chat-pane.tsx`): the pane for one session
- `PaneComposer`, `PaneComposerProps` (`pane-composer.tsx`): composer with attachment, send and stop buttons
- `ComposerInputAdapter`, `ComposerInputHandle`, `SelectionOffsets` (`composer-input-adapter.tsx`)
- `usePaneMessaging(deps)`, `PaneMessaging` (`use-pane-messaging.ts`): send, `chat.uiReply` and `sessions.compact` mutations
- `checkSend(content, state)`, `MAX_CONTENT_PARTS` (`send-checks.ts`): pre-send validation verdict
- `makeDraftStorage(rpc, sessionId)`, `appendDraft`, `PaneDraftStorage` (`draft-storage.ts`): composer draft storage backed by `rpc.drafts`
- `makeGrabStaging(deps)`, `GrabStaging`, `ComposerGrabPort` (`grab-staging.ts`): stages page element grabs as composer attachments
- `resolveGrabSource(grab, symbolicate)` (`grab-source-resolve.ts`)
- `paneAttachments`, `returnQueueToDraft` (`pane-attachments.ts`): image and text attachment adapters; Stop takes the queued messages out of the queue and puts them back in the draft (text in order, images as attachments), unsent
- `makeRefreshCoordinator(deps)`, `RefreshCoordinator` (`refresh-coordinator.ts`)
- `useSessionCaptures(sessionId)` (`session-captures.ts`), `useComposerTriggerSources({sessionId, openModelMenu})` (`trigger-sources.ts`): `{triggers, runTyped}`: slash command and tool trigger sources, plus `runTyped(text)` that runs a widget command whose `/<name>` is the whole text; widget commands are the built-in `/model` (opens the model menu) and extension commands from `useInstances()`
- `QueueStrip` (`queue-strip.tsx`), `PendingApprovals` (`pending-approvals.tsx`), `ContextTracker`, `ContextSummary` (`context-tracker.tsx`), `StatusBar` (`status-bar.tsx`)
- `Divider`, `CompactSpinner`, `ConversationSkeleton({label?})`, `ThinkingBubble` (`indicators.tsx`)
- `OlderMessages({sessionId, chat})` (`older-messages.tsx`): rendered inside the thread viewport; a solid-query query keyed on the session and the oldest shown message id runs `chat.loadOlderMessages()` (each oldest id loads once; the next key waits until no older-page load is in flight, via `useIsFetching`) while the viewport reports `isNearTop()` (within one viewport height of the top, which includes a newest page too short to scroll); shows a `Loading earlier messages` status row at the top while it loads, and an alert with Retry when it fails
- `makeToolViewCtx` (`tool-view-ctx.ts`), `toolFallbackCard` (`tool-fallback-card.tsx`), `createToolDurations` (`tool-durations.ts`, one pane-level record of tool durations; each chunk folds only the live turn's tool calls, settled entries stay, so a row that scrolls away and back reads the same duration)
- `CHAT_VIEW_ID`, `viewTabId`, `viewTabPanelId`, `viewTabPanelAttributes` (`view-tab-ids.ts`)

## Invariants

- `send-checks.ts:checkSend`: refuses empty content and sends while busy; more than `MAX_CONTENT_PARTS` (16) parts, a JSON payload over `WS_RPC_PAYLOAD_BUDGET_BYTES`, or an unreachable engine are refused with a warning and the message stays in the composer
- `use-pane-messaging.ts:usePaneMessaging`: a failed `checkSend` verdict throws `sendRejection(verdict)` before any rpc call
- `refresh-coordinator.ts:makeRefreshCoordinator`: a refresh while one is running is ignored; a refresh on a chat whose history load failed reopens it (`liveSessions.reopen`) instead of re-fetching into the failed chat
- `chat-pane.tsx:ChatPane`: keyed on the session's chat instance, so a reopened chat remounts the pane; a failed history load shows `Couldn’t load this conversation` with Retry, which calls `liveSessions.reopen(sessionId)`; while the reopened chat loads the alert stays up as a disabled `Retrying…`
- `older-messages.tsx:OlderMessages`: one older page loads at a time; nothing loads once `chat.hasOlderMessages()` is false or after a failure until Retry
- `chat-pane.tsx:threadDividers`: dividers before the first loaded message (the `New session` line) show only once no older page is left
- `chat-pane.tsx:renderTurnPrefix`: an assistant turn carries its harness name only once the session's replies (hydrated `harnessOf(messageId)`, else the current harness) span more than one harness
- `draft-storage.ts:makeDraftStorage`: the composer renders at once with an empty draft; `restore` reads `rpc.drafts.get` and hands the row to `restoreDraft` (text and selection only into an untouched composer, attachments merged by id); a composer the user emptied before the read lands gets nothing restored and its cleared draft is written at once; no write reaches the server before that restore settles, then the latest typed draft is written; writes are debounced by 300 ms (`WRITE_DELAY_MS`); clearing a non-empty draft persists the cleared draft immediately
- `queue-strip.tsx:QueueStrip`: shows at most 3 queued messages (`VISIBLE_LIMIT`), the rest as an overflow count

## Side Effects

- `draft-storage.ts:makeDraftStorage`, `appendDraft`: `rpc.drafts.get` and `rpc.drafts.set`; write errors are swallowed
- `use-pane-messaging.ts:usePaneMessaging`: `rpc.chat.uiReply` and `rpc.sessions.compact`, then `invalidateSessions`
- `refresh-coordinator.ts:run`: `chat().refresh()` and refetches `sessions.list`, `sessions.search`, the pane's `sessions.get`, `markers.list`, `captures.list`; screen reader announcements
- `chat-pane.tsx:ChatPane`: announces `conciv is asking for permission.` and `conciv replied.`; invalidates sessions and refetches markers when a run settles
- `trigger-sources.ts:useComposerTriggerSources`: `ensureQueryData` for `meta.commands` and `meta.tools`
- `trigger-sources.ts:useComposerTriggerSources`: a built-in or extension command replaces the harness command of the same name in the `/` list; a built-in beats an extension command of the same name
- `chat-pane.tsx:ChatPane`: a sent text that is exactly `/<name>` of a widget command runs it and is never sent to the agent
- `chat-pane.tsx:ChatPane`: owns the model menu (`useModelMenu`); `/model` opens it with `popover().setOpen(true)`, which focuses its search field, and every close (a pick, Escape, outside click, a settled harness-switch confirm) returns focus to the composer
- `composer-input-adapter.tsx:ComposerInputAdapter`: `keydown` listener for Escape

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
