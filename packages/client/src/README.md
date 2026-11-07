# client/src

## Overview

Source for @conciv/client: oRPC TanStack Query utils, a chat connection that picks the WebSocket transport or falls back to fetch/SSE and merges three event sources, a ref-counted push WebSocket per apiBase and session, and engine reachability tracking wired into TanStack's onlineManager.

## Interface

- `makeQueryUtils` / `QueryUtils` (`query-utils.ts`): `createTanstackQueryUtils(client)` for an `RpcClient`
- `chatConnection(rpc, apiBase, sessionId, options)` (`chat-connection.ts`): `ChatConnection` with subscribe, send, joinRun, hydrate, transport, refresh, close; `refresh` hydrates the newest `CHAT_HISTORY_PAGE_SIZE` messages
- `ChatTransport` / `ChatTransportPreference` / `ChatConnectionOptions` (`chat-connection.ts`): 'websocket' | 'fetch', plus 'auto'
- `chatSocketUrl` / `chatEventsUrl` / `socketOpens` (`chat-connection.ts`)
- `useChatSession(options)` (`use-chat-session.ts`): `createChatSession` with chatConnection, `rpc.chat.stop` and `rpc.chat.permissionDecision`
- `openPushChannel` / `acquirePushChannel` / `PushChannel` / `pushSocketUrl` / `livePushChannelCount` (`push-channel.ts`)
- `setupEngineReachability` / `engineOnline` / `sustainedEngineOffline` / `isReachabilityError` / `engineProbeRefetchInterval` / `subscribeEngineOnline` / `voteEngineProbeSettled` (`reachability.ts`)
- `ENGINE_OFFLINE_GRACE_MS` = 1000, `ENGINE_PROBE_INTERVAL_MS` = 2000, `ENGINE_HEARTBEAT_INTERVAL_MS` = 30000 (`reachability.ts`)
- `index.ts`: re-exports the modules above; `stream-relay.ts` helpers are internal

## Invariants

- `select` (`chat-connection.ts`): 'auto' probes the socket (default 2000ms) and falls back to SSE
- `socketOpens` (`chat-connection.ts`): false when `WebSocket` is undefined
- `send` (`chat-connection.ts`): for ChatMessages sends only the last turn from the last user message
- `announcedRuns` (`chat-connection.ts`): joins a pushed run only when `sessionRunEvent.parse` succeeds and `options.joinsRun(runId)` is true
- `finishedOnItsLifecycle` (`chat-connection.ts`): a joined run (announced, or `joinRun`) that reports its own `aborted` run lifecycle (a stopped run, which has no `RUN_FINISHED`/`RUN_ERROR`) is closed with a `RUN_FINISHED` for that run, so a client that joined it stops generating; a completed or failed run ends on its own `RUN_FINISHED`/`RUN_ERROR`, which the server sends after the lifecycle
- `merged` (`chat-connection.ts`): aborts all sources when any finishes
- `decoded` (`push-channel.ts`): drops frames failing `PushFrameSchema.safeParse`
- `acquirePushChannel` (`push-channel.ts`): ref-counted per apiBase and session; the socket closes when the last holder releases
- `openPushChannel` (`push-channel.ts`): the socket tells the server it serves page queries (`page-serving` frame) while at least one `queries()` consumer is live, and says so again on every reconnect; a `queries()` consumer stops it when aborted, returned or broken out of; a socket held only for `events()` never receives page queries, so a session the page is not showing has its page tools refused at once
- `registerReachabilitySource` (`reachability.ts`): restores the default onlineManager listener on the last release

## Side Effects

- `socketOpens` (`chat-connection.ts`): opens and closes a probe WebSocket
- `close` (`chat-connection.ts`): closes every tracked WebSocket
- `hydrate` / SSE (`chat-connection.ts`): fetch calls and the `rpc.chat.hydrate` RPC
- `openPushChannel` (`push-channel.ts`): partysocket ReconnectingWebSocket; module-level shared channel map
- `setupEngineReachability` (`reachability.ts`): sets the onlineManager event listener and window online/offline listeners
- `useChatSession` (`use-chat-session.ts`): calls `rpc.chat.stop` and `rpc.chat.permissionDecision`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck && pnpm lint`
