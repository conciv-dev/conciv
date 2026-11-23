# client/src

## Overview

Source for @conciv/client: oRPC TanStack Query utils, a chat connection that carries every turn on `rpc.chat.send` and every rejoin on `rpc.chat.join` over the browser rpc socket and merges three event sources (its turns' subscription and two `rpc.chat.events` streams), and engine reachability tracking wired into TanStack's onlineManager.

## Interface

- `makeQueryUtils` / `QueryUtils` (`index.ts`): `createTanstackQueryUtils(client)` for an `RpcClient`
- `chatConnection` (`chat-connection.ts`): one session's chat over the rpc socket of the api base it is given: subscribe, send, joinRun, hydrate, refresh, close; `refresh` hydrates the newest `CHAT_HISTORY_PAGE_SIZE` messages
- `ChatConnectionOptions` (`chat-connection.ts`)
- `useChatSession(options)` (`index.ts`): `createChatSession` with chatConnection, `rpc.chat.stop` and `rpc.chat.permissionDecision`
- `setupEngineReachability` / `engineOnline` / `sustainedEngineOffline` / `isReachabilityError` (`reachability.ts`)
- `sustainedEngineOffline(graceMs)` turns true after the engine stays offline for `graceMs`, default `defaultEngineConnectionTimings.offlineGraceMs` = 1000 from `@conciv/contract` (`reachability.ts`)
- `index.ts`: re-exports the modules above; `chat-connection.ts` helpers are internal

## Invariants

- `overRpc` (`chat-connection.ts`): one TanStack AI `rpcStream` adapter; a turn is `rpc.chat.send` and `joinRun` is `rpc.chat.join`, and the rpc retry resubscribes a dropped stream from its last event id; a resume the engine refuses with `UNAUTHORIZED` (the run's stream was cut by a revoke or logout) waits until the api base's trust is `trusted` again and resumes, while a turn refused before its stream began fails as before
- `send` (`chat-connection.ts`): for ChatMessages sends only the last turn from the last user message
- `announcedRuns` (`chat-connection.ts`): stops at the first announcement read after its scope aborts, so a closed chat never drains a backlog of announcements into hydrate calls; joins a pushed run only when `sessionRunEvent.parse` succeeds and `options.joinsRun(runId)` is true
- `finishedOnItsLifecycle` (`chat-connection.ts`): a joined run (announced, or `joinRun`) that reports its own `aborted` run lifecycle (a stopped run, which has no `RUN_FINISHED`/`RUN_ERROR`) is closed with a `RUN_FINISHED` for that run, so a client that joined it stops generating; a completed or failed run ends on its own `RUN_FINISHED`/`RUN_ERROR`, which the server sends after the lifecycle
- `merged` (`chat-connection.ts`): aborts all sources when any finishes
- `sessionEvents` (`chat-connection.ts`): an `rpc.chat.events` stream the engine refuses with `UNAUTHORIZED` (opened while logged out, or failed by a revoke) is not a chat error: it waits until the api base's trust is `trusted` again and subscribes anew, as the push socket's reconnect did
- `eventsLink` (`chat-connection.ts`): the watched `rpc.chat.events` stream (the one `subscribe` opens for the session, not the one `announcedRuns` reads) is the connection's connected point, as opencode's client sync: it is live once `rpc.chat.events` answers (the engine listens before it answers), and the latest-window `hydrate` (no `before`) waits for that, so the panel fetches its history once, after it can no longer miss an event; a stream that drops goes back to waiting and, once live again, `options.onLiveAgain` fires once so the session re-hydrates; a stream that fails for good releases the waiting `hydrate`
- `registerReachabilitySource` (`reachability.ts`): restores the default onlineManager listener on the last release

## Side Effects

- `close` (`chat-connection.ts`): aborts every stream the connection opened
- `hydrate` (`chat-connection.ts`): the `rpc.chat.hydrate` RPC, for the latest window once the watched events stream is live; `refresh` and older pages call it at once
- `setupEngineReachability` (`reachability.ts`): sets the onlineManager event listener and window online/offline listeners
- `useChatSession` (`index.ts`): calls `rpc.chat.stop` and `rpc.chat.permissionDecision`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck && pnpm lint`
