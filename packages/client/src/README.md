# client/src

## Overview

Source for @conciv/client: one client, `ConcivClient` (`Conciv.make`), over the plain oRPC contract client, oRPC TanStack Query utils, a chat connection that carries every turn on `rpc.chat.send` and every rejoin on `rpc.chat.join` over the browser rpc socket and merges four event sources (its turns' subscription, the session's `rpc.chat.events` stream, the runs that stream announces and the runs handed over to it), and engine reachability tracking wired into TanStack's onlineManager.

## Layout

- `connection/`: the engine socket, its connection machine, trust, reachability and the typed oRPC client.
- `chat/`: the Solid chat session and the chat connection that carries it over the rpc socket.
- `settings/`: settings queries.
- `plugin/`: `Conciv.make` and its `ConcivClient`, the one client every reader uses (the widget UI, the plugin host and plugins as `ctx.client`, the engine's server list, the cli): the contract's groups over the plain contract client (`EngineClient`, `connection/rpc-client.ts`), typed plugin rpc (`client.rpc(definition)`, a `PluginClient`), and the shared event stream, plus `ServerRef`/`Servers`. Exported from the main entry `@conciv/client`; browser and engine both use it, and it imports nothing from a backend package.
- The src root holds the entry files only, one per `package.json` export.

## Invariants

- `overRpc` (`chat/chat-connection.ts`): one TanStack AI `rpcStream` adapter; a turn is `rpc.chat.send` and `joinRun` is `rpc.chat.join`, and the rpc retry resubscribes a dropped stream from its last event id; a resume the engine refuses with `UNAUTHORIZED` (the run's stream was cut by a revoke or logout) waits until the api base's trust is `trusted` again and resumes, while a turn refused before its stream began fails as before
- `send` (`chat/chat-connection.ts`): for ChatMessages sends only the last turn from the last user message
- `announcedRuns` (`chat/chat-connection.ts`): stops at the first announcement read after its scope aborts, so a closed chat never drains a backlog of announcements into hydrate calls; joins a pushed run only when `sessionRunEvent.parse` succeeds and `options.joinsRun(runId)` is true
- `finishedOnItsLifecycle` (`chat/chat-connection.ts`): a joined run (announced, or `joinRun`) that reports its own `aborted` run lifecycle (a stopped run, which has no `RUN_FINISHED`/`RUN_ERROR`) is closed with a `RUN_FINISHED` for that run, so a client that joined it stops generating; a completed or failed run ends on its own `RUN_FINISHED`/`RUN_ERROR`, which the server sends after the lifecycle
- `merged` (`chat/chat-connection.ts`): aborts all sources when any finishes
- `sessionEvents` (`chat/chat-connection.ts`): an `rpc.chat.events` stream the engine refuses with `UNAUTHORIZED` (opened while logged out, or failed by a revoke) is not a chat error: it waits until the api base's trust is `trusted` again and subscribes anew, as the push socket's reconnect did
- `SharedEvents.make` (`plugin/shared-events.ts`): one event subscription shared by every reader; each (re)open starts with `server.connected`, which a reader that joins late also gets, its cue to resync; a reader 4096 events behind is failed
- `received` (`plugin/client.ts`): the shared stream's feed is one `event.subscribe` call; it has no reopen loop of its own. Over the engine socket, oRPC's `ClientRetryPlugin` (`connection/engine-connection.ts`) reopens it after a drop once the socket is open again, so every reader sees a fresh `server.connected`; an `event.subscribe` the engine ends cleanly is treated as a dropped socket (the machine's `stream-ended`: the socket is closed and reopened on the machine's back-off, `reconnectMinDelayMs` to `reconnectMaxDelayMs`, reset after `MIN_UPTIME` of uptime) and then reopened the same way; a subscribe refused with `UNAUTHORIZED` is retried once the connection's trust is `trusted` again (`trustedAgain`, the same wait the chat streams use). The status (`ClientConnectionStatus`, as opencode) is `connected` on `server.connected`, `reconnecting` on a retry (`connecting` on a retry after a login refusal), `connecting` when the last reader leaves. Over plain fetch (`makeRpcClient`, one-shot cli calls) nothing reopens the stream
- The stall watch (`connection/engine-connection.ts`): while at least one streaming call is open, a socket that delivers no frame for `idleTimeoutMs` (45 s by default, the engine's heartbeat comes every 15 s) is dropped and opened again (the machine's `stalled` event); every streaming call then reopens through the retry plugin
- `registerReachabilitySource` (`connection/reachability.ts`): restores the default onlineManager listener on the last release

## Side Effects

- `close` (`chat/chat-connection.ts`): aborts every stream the connection opened
- `hydrate` (`chat/chat-connection.ts`): the `rpc.chat.hydrate` RPC
- `setupEngineReachability` (`connection/reachability.ts`): sets the onlineManager event listener and window online/offline listeners
- `useChatSession` (`client.ts`): calls `rpc.chat.stop` and `rpc.chat.permissionDecision`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck`, then `pnpm lint` at the repo root
