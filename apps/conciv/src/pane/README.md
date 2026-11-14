# pane

## Overview

The chat pane for one session: transcript, composer with attachments and element grabs, drafts persisted over rpc, send checks, queue strip, pending approvals, context usage tracker, status bar with view tabs, and refresh.

## Interface

- `ChatPane({sessionId, viewTab?})` (`chat-pane.tsx`): the pane for one session
- `PaneComposer`, `PaneComposerProps` (`pane-composer.tsx`): composer with attachment, send and stop buttons
- `ComposerInputAdapter`, `ComposerInputHandle`, `SelectionOffsets` (`composer-input-adapter.tsx`)
- `usePaneMessaging(deps)`, `PaneMessaging` (`use-pane-messaging.ts`): send, `chat.uiReply` and `sessions.compact` mutations
- `makeDraftStorage(appData, sessionId)`, `appendDraft(appData, sessionId, text)`, `PaneDraftStorage` (`draft-storage.ts`): composer draft storage backed by `AppData.readDraft`, `cachedDraft` and `saveDraft` (`data/app-data.ts`): the `drafts.get` query cache entry and a `drafts.set` mutation scoped to the session
- `checkSend(content, state)`, `checkSendState(state)`, `MAX_CONTENT_PARTS` (`send-checks.ts`): pre-send validation verdict; `state` is `{busy, reachable, locked}`, `locked` being the `EngineLock` read from `useEngineReachability().locked()`
- `makeGrabStaging(deps)`, `GrabStaging`, `ComposerGrabPort` (`grab-staging.ts`): stages page element grabs as composer attachments
- `resolveGrabSource(grab, symbolicate)` (`grab-source-resolve.ts`)
- `paneAttachments`, `returnQueueToDraft` (`pane-attachments.ts`): image and text attachment adapters; Stop takes the queued messages out of the queue and puts them back in the draft (text in order, images as attachments), unsent
- `makeRefreshCoordinator(deps)`, `RefreshCoordinator` (`refresh-coordinator.ts`)
- `useSessionCaptures(sessionId)` (`session-captures.ts`), `useComposerTriggerSources({sessionId, openModelMenu})` (`trigger-sources.ts`): `{triggers, runTyped}`: slash command and tool trigger sources, plus `runTyped(text)` that runs a widget command whose `/<name>` is the whole text; widget commands are the built-in `/model` (opens the model menu) and extension commands from `useInstances()`
- `QueueStrip` (`queue-strip.tsx`), `PendingApprovals` (`pending-approvals.tsx`), `ContextTracker`, `ContextSummary` (`context-tracker.tsx`), `StatusBar` (`status-bar.tsx`)
- `Divider`, `CompactSpinner`, `ConversationSkeleton({label?})`, `ThinkingBubble` (`indicators.tsx`)
- `OlderMessages({sessionId, chat})` (`older-messages.tsx`): rendered inside the thread viewport; a solid-query query keyed on the session and the oldest shown message id runs `chat.loadOlderMessages()` (each oldest id loads once; the next key waits until no older-page load is in flight, via `useIsFetching`) while the viewport reports `isNearTop()` (within three viewport heights of the top, so the page before loads while the reader still has history above them; a newest page shorter than that keeps loading pages until it is not); shows a `Loading earlier messages` status row at the top while it loads, and an alert with Retry when it fails
- `makeToolViewCtx` (`tool-view-ctx.ts`), `toolFallbackCard` (`tool-fallback-card.tsx`), `createToolDurations` (`tool-durations.ts`, one pane-level record of tool durations; each chunk folds only the live turn's tool calls, settled entries stay, so a row that scrolls away and back reads the same duration)
- `CHAT_VIEW_ID`, `viewTabId`, `viewTabPanelId`, `viewTabPanelAttributes` (`view-tab-ids.ts`)

## Invariants

- `send-checks.ts:checkSend`: refuses empty content, then whatever `checkSendState` refuses, then more than `MAX_CONTENT_PARTS` (16) parts or a JSON payload over `WS_RPC_PAYLOAD_BUDGET_BYTES`, each with a warning while the message stays in the composer
- `send-checks.ts:checkSendState`: refuses silently while a compaction runs; while the page is logged out or its login was revoked it refuses with the locked notice's own sentence (`lockedMessage` from `shell/engine-lock-messages.ts`); while the engine is unreachable it refuses with `conciv lost connection to the engine. Your message is still in the composer.`
- `use-pane-messaging.ts:usePaneMessaging`: one gate for every send. A failed `checkSend` verdict throws `sendRejection(verdict)` before any rpc call; `onSteer` throws the `checkSendState` rejection before the kit's Steer resends a queued message. The pane wires the composer (Send and Enter), the empty-state starters and tool card replies (`chat-pane.tsx:sendFromButton`, which is `onSend` then `onSendError`) and Steer (`onSteer`, with `onSendError` as `onSteerError`) through it
- `pane-composer.tsx:ComposerSendControl`: Send is disabled while the engine is unreachable or the page is locked; its accessible name is then the locked notice's sentence, else `conciv lost connection to the engine`
- `refresh-coordinator.ts:makeRefreshCoordinator`: a refresh while one is running is ignored; a refresh on a chat whose history load failed reopens it (`liveSessions.reopen`) instead of re-fetching into the failed chat
- `chat-pane.tsx:ChatPane`: keyed on the session's chat instance, so a reopened chat remounts the pane; a failed history load shows `Couldn’t load this conversation` with Retry, which calls `liveSessions.reopen(sessionId)`; while the reopened chat loads the alert stays up as a disabled `Retrying…`
- `older-messages.tsx:OlderMessages`: one older page loads at a time; nothing loads once `chat.hasOlderMessages()` is false or after a failure until Retry
- `chat-pane.tsx:threadDividers`: dividers before the first loaded message (the `New session` line) show only once no older page is left
- `chat-pane.tsx:renderTurnPrefix`: an assistant turn carries its harness name only once the session's replies (hydrated `readHarness(messageId)`, else the current harness) span more than one harness
- `draft-storage.ts:makeDraftStorage`: the composer renders at once with an empty draft; `restore` reads the row through `appData.readDraft` (`ensureQueryData` on `utils.drafts.get`) and hands it to `restoreDraft` (text and selection only into an untouched composer, attachments merged by id); a composer the user emptied before the read lands gets nothing restored and its cleared draft is written at once; no write reaches the server before that restore settles, then the latest typed draft is written; every save is a `drafts.set` mutation with `scope: {id: sessionId}`, so saves for one session reach the server in order, and its `onMutate` writes the row into the `drafts.get` cache entry (kept with `staleTime` and `gcTime` Infinity and `retry: false` in `app-data.ts`); `storage.getItem` returns that cached row, else the pane-local value, so a pane rebuilt after a view switch paints the text at once; keystrokes are batched by the kit's own 300 ms debounce, which flushes when the composer unmounts; clearing a non-empty draft persists the cleared draft immediately
- `queue-strip.tsx:QueueStrip`: shows at most 3 queued messages (`VISIBLE_LIMIT`), the rest as an overflow count

## Side Effects

- `draft-storage.ts:makeDraftStorage`, `appendDraft`: `drafts.get` through the query cache and `drafts.set` through a scoped mutation; a failed save is logged with `console.error` and the cache keeps the text, with no rollback, so after a refused save the text lives only in this page's cache until a later save succeeds
- `use-pane-messaging.ts:usePaneMessaging`: `rpc.chat.uiReply` and `rpc.sessions.compact`, then `invalidateSession` for the pane's session
- `refresh-coordinator.ts:run`: `chat().refresh()` and refetches `sessions.list`, `sessions.search`, the pane's `sessions.get`, `markers.list`, `captures.list`; screen reader announcements
- `chat-pane.tsx:ChatPane`: announces `conciv is asking for permission.` and `conciv replied.`; invalidates sessions and refetches markers when a run settles
- `trigger-sources.ts:useComposerTriggerSources`: `ensureQueryData` for `meta.commands` and `meta.tools`
- `trigger-sources.ts:useComposerTriggerSources`: a built-in or extension command replaces the harness command of the same name in the `/` list; a built-in beats an extension command of the same name
- `chat-pane.tsx:ChatPane`: a sent text that is exactly `/<name>` of a widget command runs it and is never sent to the agent
- `chat-pane.tsx:ChatPane`: owns the model menu (`useModelMenu`); `/model` opens it with `popover().setOpen(true)`, which focuses its search field, and every close (a pick, Escape, outside click, a settled harness-switch confirm) returns focus to the composer
- `composer-input-adapter.tsx:ComposerInputAdapter`: `keydown` listener for Escape

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
