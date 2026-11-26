# client/src

## Overview

Source for @conciv/client: oRPC TanStack Query utils, a chat connection that carries every turn on `rpc.chat.send` and every rejoin on `rpc.chat.join` over the browser rpc socket and merges three event sources (its turns' subscription and two `rpc.chat.events` streams), and engine reachability tracking wired into TanStack's onlineManager.

## Layout

- `connection/`: the engine socket, its connection machine, trust, reachability and the typed oRPC client.
- `chat/`: the Solid chat session and the chat connection that carries it over the rpc socket.
- `settings/`: settings queries.
- `plugin/`: the plugin client (`Conciv.make`, `ConcivClient`, plugin rpc, the shared event stream, `ServerRef`/`Servers`). Browser and engine both use it, so it lives here and not in `@conciv/backend-plugin-api`; it imports nothing from a backend package.
- `testing/`: the fake engine behind `@conciv/client/testing`.
- The src root holds the entry files only, one per `package.json` export.

## Invariants

- `overRpc` (`chat/chat-connection.ts`): one TanStack AI `rpcStream` adapter; a turn is `rpc.chat.send` and `joinRun` is `rpc.chat.join`, and the rpc retry resubscribes a dropped stream from its last event id; a resume the engine refuses with `UNAUTHORIZED` (the run's stream was cut by a revoke or logout) waits until the api base's trust is `trusted` again and resumes, while a turn refused before its stream began fails as before
- `send` (`chat/chat-connection.ts`): for ChatMessages sends only the last turn from the last user message
- `announcedRuns` (`chat/chat-connection.ts`): stops at the first announcement read after its scope aborts, so a closed chat never drains a backlog of announcements into hydrate calls; joins a pushed run only when `sessionRunEvent.parse` succeeds and `options.joinsRun(runId)` is true
- `finishedOnItsLifecycle` (`chat/chat-connection.ts`): a joined run (announced, or `joinRun`) that reports its own `aborted` run lifecycle (a stopped run, which has no `RUN_FINISHED`/`RUN_ERROR`) is closed with a `RUN_FINISHED` for that run, so a client that joined it stops generating; a completed or failed run ends on its own `RUN_FINISHED`/`RUN_ERROR`, which the server sends after the lifecycle
- `merged` (`chat/chat-connection.ts`): aborts all sources when any finishes
- `sessionEvents` (`chat/chat-connection.ts`): an `rpc.chat.events` stream the engine refuses with `UNAUTHORIZED` (opened while logged out, or failed by a revoke) is not a chat error: it waits until the api base's trust is `trusted` again and subscribes anew, as the push socket's reconnect did
- `registerReachabilitySource` (`connection/reachability.ts`): restores the default onlineManager listener on the last release

## Side Effects

- `close` (`chat/chat-connection.ts`): aborts every stream the connection opened
- `hydrate` (`chat/chat-connection.ts`): the `rpc.chat.hydrate` RPC
- `setupEngineReachability` (`connection/reachability.ts`): sets the onlineManager event listener and window online/offline listeners
- `useChatSession` (`client.ts`): calls `rpc.chat.stop` and `rpc.chat.permissionDecision`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck`, then `pnpm lint` at the repo root
