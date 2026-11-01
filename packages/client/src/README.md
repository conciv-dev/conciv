# client/src

## Overview

Source for @conciv/client: oRPC TanStack Query utils, a chat connection that picks the WebSocket transport or falls back to fetch/SSE and merges three event sources, a ref-counted push WebSocket per apiBase and session, and engine reachability tracking wired into TanStack's onlineManager.

## Interface

- `makeQueryUtils` / `QueryUtils` (`query-utils.ts`): `createTanstackQueryUtils(client)` for an `RpcClient`
- `chatConnection(rpc, apiBase, sessionId, options)` (`chat-connection.ts`): `ChatConnection` with subscribe, send, joinRun, hydrate, transport, refresh, close
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
- `merged` (`chat-connection.ts`): aborts all sources when any finishes
- `decoded` (`push-channel.ts`): drops frames failing `PushFrameSchema.safeParse`
- `acquirePushChannel` (`push-channel.ts`): ref-counted per apiBase and session; the socket closes when the last holder releases
- `registerReachabilitySource` (`reachability.ts`): restores the default onlineManager listener on the last release

## Side Effects

- `socketOpens` (`chat-connection.ts`): opens and closes a probe WebSocket
- `close` (`chat-connection.ts`): closes every tracked WebSocket
- `hydrate` / SSE (`chat-connection.ts`): fetch calls and the `rpc.chat.hydrate` RPC
- `openPushChannel` (`push-channel.ts`): partysocket ReconnectingWebSocket; module-level shared channel map
- `setupEngineReachability` (`reachability.ts`): sets the onlineManager event listener and window online/offline listeners
- `useChatSession` (`use-chat-session.ts`): calls `rpc.chat.stop` and `rpc.chat.permissionDecision`

## Verification

- Run: `cd packages/client && pnpm test`
- Typecheck and lint: `cd packages/client && pnpm typecheck && pnpm lint`
