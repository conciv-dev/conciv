# client/src

## Overview

Source for @conciv/client: oRPC TanStack Query utils, a chat connection that carries every turn on `rpc.chat.send` and every rejoin on `rpc.chat.join` over the browser rpc socket and merges four event sources (its turns' subscription, the session's `rpc.chat.events` stream, the runs that stream announces and the runs handed over to it), and engine reachability tracking wired into TanStack's onlineManager.

## Interface

- `client.ts`: the `.` entry: the engine connection (one oRPC websocket per api base, `RPC_WS_PATH` of `@conciv/types/rpc-types`), the rpc client, the query utils, the chat connection, reachability, and the TanStack Query surface the widget and plugins share.
- `chat.ts`: the `./chat` entry, the session in [./session/README.md](./session/README.md).
- `testing.ts`: the `./testing` entry, the fake engine (`fake-*.ts`) and story connections.
- `sustainedEngineOffline(graceMs)` (`reachability.ts`) turns true after the engine stays offline for `graceMs`, default `defaultEngineConnectionTimings.offlineGraceMs` = 1000 (`engine-connection-machine.ts`).

## Invariants

- `overRpc` (`chat-connection.ts`): one TanStack AI `rpcStream` adapter; a turn is `rpc.chat.send` and `joinRun` is `rpc.chat.join`, and the rpc retry resubscribes a dropped stream from its last event id; a resume the engine refuses with `UNAUTHORIZED` (the run's stream was cut by a revoke or logout) waits until the api base's trust is `trusted` again and resumes, while a turn refused before its stream began fails as before
- `send` (`chat-connection.ts`): for ChatMessages sends only the last turn from the last user message
- `announcedRuns` (`chat-connection.ts`): stops at the first announcement read after its scope aborts, so a closed chat never drains a backlog of announcements into hydrate calls; joins a pushed run only when `sessionRunEvent.parse` succeeds and `options.joinsRun(runId)` is true
- `finishedOnItsLifecycle` (`chat-connection.ts`): a joined run (announced, or `joinRun`) that reports its own `aborted` run lifecycle (a stopped run, which has no `RUN_FINISHED`/`RUN_ERROR`) is closed with a `RUN_FINISHED` for that run, so a client that joined it stops generating; a completed or failed run ends on its own `RUN_FINISHED`/`RUN_ERROR`, which the server sends after the lifecycle
- `merged` (`chat-connection.ts`): aborts all sources when any finishes
- `sessionEvents` (`chat-connection.ts`): an `rpc.chat.events` stream the engine refuses with `UNAUTHORIZED` (opened while logged out, or failed by a revoke) is not a chat error: it waits until the api base's trust is `trusted` again and subscribes anew, as the push socket's reconnect did
- `setupEngineReachability` (`reachability.ts`): its release restores the default browser onlineManager listener, once

## Side Effects

- `close` (`chat-connection.ts`): aborts every stream the connection opened
- `hydrate` (`chat-connection.ts`): the `rpc.chat.hydrate` RPC
- `setupEngineReachability` (`reachability.ts`): sets the onlineManager event listener and window online/offline listeners
- `useChatSession` (`client.ts`): calls `rpc.chat.stop` and `rpc.chat.permissionDecision`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck`, then `pnpm lint` at the repo root
