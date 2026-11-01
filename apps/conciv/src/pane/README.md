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
- `paneAttachments`, `returnUnsentToDraft` (`pane-attachments.ts`): image and text attachment adapters; unsent queue goes back to the draft
- `makeRefreshCoordinator(deps)`, `RefreshCoordinator` (`refresh-coordinator.ts`)
- `trackSessionActivity(deps)` (`session-activity.ts`): registers the pane in live sessions
- `useSessionCaptures(sessionId)` (`session-captures.ts`), `useComposerTriggerSources(sessionId)` (`trigger-sources.ts`): slash command and tool trigger sources
- `QueueStrip` (`queue-strip.tsx`), `PendingApprovals` (`pending-approvals.tsx`), `ContextTracker`, `ContextSummary` (`context-tracker.tsx`), `StatusBar` (`status-bar.tsx`)
- `Divider`, `CompactSpinner`, `ConversationSkeleton`, `ThinkingBubble` (`indicators.tsx`)
- `makeToolViewCtx` (`tool-view-ctx.ts`), `toolFallbackCard` (`tool-fallback-card.tsx`), `foldToolDurations` (`tool-durations.ts`)
- `CHAT_VIEW_ID`, `viewTabId`, `viewTabPanelId`, `viewTabPanelAttributes` (`view-tab-ids.ts`)

## Invariants

- `send-checks.ts:checkSend`: refuses empty content and sends while busy; more than `MAX_CONTENT_PARTS` (16) parts, a JSON payload over `WS_RPC_PAYLOAD_BUDGET_BYTES`, or an unreachable engine are refused with a warning and the message stays in the composer
- `use-pane-messaging.ts:usePaneMessaging`: a failed `checkSend` verdict throws `sendRejection(verdict)` before any rpc call
- `refresh-coordinator.ts:makeRefreshCoordinator`: a refresh while one is running is ignored
- `draft-storage.ts:makeDraftStorage`: writes are debounced by 300 ms (`WRITE_DELAY_MS`); clearing a non-empty draft cancels the pending write and persists the cleared draft immediately
- `queue-strip.tsx:QueueStrip`: shows at most 3 queued messages (`VISIBLE_LIMIT`), the rest as an overflow count
- `session-activity.ts:trackSessionActivity`: sessions are invalidated on unmount only if the pane was observed active

## Side Effects

- `draft-storage.ts:makeDraftStorage`, `appendDraft`: `rpc.drafts.get` and `rpc.drafts.set`; write errors are swallowed
- `use-pane-messaging.ts:usePaneMessaging`: `rpc.chat.uiReply` and `rpc.sessions.compact`, then `invalidateSessions`
- `refresh-coordinator.ts:run`: `chat().refresh()` and refetches `sessions.list`, `markers.list`, `captures.list`; screen reader announcements
- `chat-pane.tsx:ChatPane`: announces `conciv is asking for permission.` and `conciv replied.`; invalidates sessions and refetches markers when a run settles
- `trigger-sources.ts:useComposerTriggerSources`: `ensureQueryData` for `meta.commands` and `meta.tools`
- `composer-input-adapter.tsx:ComposerInputAdapter`: `keydown` listener for Escape

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
