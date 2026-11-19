# client/src

## Overview

Source for @conciv/client: oRPC TanStack Query utils, a chat connection that picks the WebSocket transport or falls back to fetch/SSE and merges three event sources (its transport's subscription and two `rpc.chat.events` streams), the page plane's `rpc.page.queries` stream, and engine reachability tracking wired into TanStack's onlineManager.

## Interface

- `makeQueryUtils` / `QueryUtils` (`query-utils.ts`): `createTanstackQueryUtils(client)` for an `RpcClient`
- `chatConnection(rpc, apiBase, sessionId, options)` (`chat-connection.ts`): `ChatConnection` with subscribe, send, joinRun, hydrate, transport, refresh, close; `refresh` hydrates the newest `CHAT_HISTORY_PAGE_SIZE` messages
- `ChatTransport` / `ChatTransportPreference` / `ChatConnectionOptions` (`chat-connection.ts`): 'websocket' | 'fetch', plus 'auto'
- `chatSocketUrl` / `chatEventsUrl` / `socketOpens` (`chat-connection.ts`)
- `useChatSession(options)` (`use-chat-session.ts`): `createChatSession` with chatConnection, `rpc.chat.stop` and `rpc.chat.permissionDecision`
- `setupEngineReachability` / `engineOnline` / `sustainedEngineOffline` / `isReachabilityError` / `subscribeEngineOnline` (`reachability.ts`)
- `ENGINE_OFFLINE_GRACE_MS` = 1000 (`reachability.ts`)
- `index.ts`: re-exports the modules above; `stream-relay.ts` helpers are internal

## Invariants

- `select` (`chat-connection.ts`): 'auto' probes the socket (default 2000ms) and falls back to SSE
- `socketOpens` (`chat-connection.ts`): false when `WebSocket` is undefined
- `send` (`chat-connection.ts`): for ChatMessages sends only the last turn from the last user message
- `announcedRuns` (`chat-connection.ts`): stops at the first announcement read after its scope aborts, so a closed chat never drains a backlog of announcements into hydrate calls; joins a pushed run only when `sessionRunEvent.parse` succeeds and `options.joinsRun(runId)` is true
- `finishedOnItsLifecycle` (`chat-connection.ts`): a joined run (announced, or `joinRun`) that reports its own `aborted` run lifecycle (a stopped run, which has no `RUN_FINISHED`/`RUN_ERROR`) is closed with a `RUN_FINISHED` for that run, so a client that joined it stops generating; a completed or failed run ends on its own `RUN_FINISHED`/`RUN_ERROR`, which the server sends after the lifecycle
- `merged` (`chat-connection.ts`): aborts all sources when any finishes
- `sessionEvents` (`chat-connection.ts`): an `rpc.chat.events` stream the engine refuses with `UNAUTHORIZED` (opened while logged out, or failed by a revoke) is not a chat error: it waits until the api base's trust is `trusted` again and subscribes anew, as the push socket's reconnect did
- `pageQueries` (`page-queries.ts`): opens `rpc.page.queries` with the tab's focus (`document.hasFocus()`, `visibilityState`), drops the stream's `ready` and sends `rpc.page.focus` for its browser tab on every `ready` (a resubscribe after a reconnect gets a new tab id) and on every window focus, blur and visibility change, so the engine sends each page query to the tab focused last; it ends quietly when its signal aborts
- `registerReachabilitySource` (`reachability.ts`): restores the default onlineManager listener on the last release

## Side Effects

- `socketOpens` (`chat-connection.ts`): opens and closes a probe WebSocket
- `close` (`chat-connection.ts`): closes every tracked WebSocket
- `hydrate` / SSE (`chat-connection.ts`): fetch calls and the `rpc.chat.hydrate` RPC
- `setupEngineReachability` (`reachability.ts`): sets the onlineManager event listener and window online/offline listeners
- `useChatSession` (`use-chat-session.ts`): calls `rpc.chat.stop` and `rpc.chat.permissionDecision`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck && pnpm lint`
