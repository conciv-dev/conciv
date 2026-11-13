# core/src/page

## Overview

The per-session page bus that carries page queries to browser tabs, the change journal that records page edits, and the page action queues that play queued page actions and report their outcome.

## Interface

- `makePageBus(timeoutMs=5000)` / `pageQueryStream` / `makeJournal` / `PageEnv` (`page-bus.ts`); each subscriber is one browser tab with an engine-assigned id (`b1`, `b2`, ...) and a focus getter (`{focusedAt, visible}`, fed by the push socket's `page-serving` frames); `PageBus.ask(sessionId, query, route?, signal?)` sends the query to exactly one browser tab, the one `{browserTab}` names or else the one focused last (then visible, then subscribed last), under a random request id only that tab sees; a browser tab that unsubscribes fails its in-flight queries with `no-widget` ('browser tab <id> closed before it replied') and a late reply settles nothing, except for a page tool call (`route` `{mutating}`, passed by `runClientTool` from the tool's mark): a reading call waits for a browser tab of the session to serve again (a new subscriber, or one already there) and is sent once more to the one focused last, failing as before when none serves within 5 seconds or the call's own timeout, which the resend never extends; a changing call is never sent again and fails at once with `no-widget` 'the page reloaded or closed during <tool>; it may already have run. Take a new snapshot before continuing'; and a named browser tab that is not open fails `no-widget` naming the open ids; an aborted `signal` (the caller's tool request signal, carried on `ToolRequest.signal`) fails the call at once with the signal's reason, drops its waiter, and never resends; `PageBus.openSessions()` lists `{sessionId, browserTabs}` (ids, the default target first) for every session with at least one subscriber
- `makePageQueues({bus, journal})` / `PageQueues` / `QueueRecord` / `QueueStart` / `startQueueFollowUp` / `owesFollowUp` / `holdForNextReply` / `pageQueueChunks` (`page-queue.ts`); `owesFollowUp(queues, sessionId)` reads, without claiming, whether a finished result is owed a follow-up turn, the same check `startQueueFollowUp` starts with; `holdForNextReply(queues, sessionId)` moves the session's owed results to `nextReply` without starting a turn, which the engine does when a run ends `aborted` (a user stop, a steer, a compact or clear ending the run, the startup sweep), so the result arrives with the agent's next reply

## Invariants

- `ask` (`page-bus.ts`): 'no-widget' without a subscriber for the session (with the message `the page is showing another session; switch back to this session to use page tools` when another session has one), 'timeout' on expiry

## Side Effects

- `makeJournal` (`page-bus.ts`): writes page changes to the DB

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
