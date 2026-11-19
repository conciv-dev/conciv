# plugin-testkit/src

## Overview

Test utilities for @conciv/plugin-testkit. They boot an in-process core kit around the fake model chat, listen on loopback, and supply wire observers and fault injectors for RPC, chat and push traffic, the ConcivWidget component suite and a click-based grab.

## Product path

The testkit runs the real product path. A page under test talks to the engine through the same transports and clients the product uses: browser rpc, chat turns included, goes over the partysocket `/rpc-ws` socket from `@conciv/contract`. The only fakes are the expensive externals: the LLM harness (a scripted fake harness) and the agent CLIs. Interception never swaps a transport: `rpc-socket.ts` routes the page's real `/rpc-ws` socket with `page.routeWebSocket` to observe calls or fault them (fail, hold, cut), and everything it does not fault reaches the engine unchanged. A node-side helper uses HTTP `/rpc` only where the product caller it stands in for is itself a node client, such as the CLI calling `registry.call`.

## Interface

- `bootCoreKit` / `CoreKit` (`core-kit.ts`): builds a fake harness plus `makeApp` through `@conciv/harness-testkit` `createTestkit`, returning Kit & {harness, forSession, home}; `home` is the kit's own conciv home folder (`home` under the kit's state folder, passed to `makeApp`, so the global settings file and the home db never touch `CONCIV_HOME` and go away with `cleanup()`); `resumeBin` names the bin of the fake's resume command (default the harness id)
- `listenLocal` (`listen-local.ts`): listens on 127.0.0.1 (port 0 by default) and returns {base, port, close}
- `completeConnectHandshake` (`connect-handshake.ts`): waits for the 'connect pane ready' status, dispatches `embedtest:connect`, waits for the page-plane subscription, then polls page's Definition (`plugin.call` `experimental.page` `sessions.attached`) until it lists the session
- `pagePlaneWatchFor` / `awaitPagePlaneSubscribed` / `PagePlaneWatch` (`page-plane.ts`): per-page watch that resolves once a `page.queries` stream on RPC_WS_PATH yields its 'ready' (the stream's first item, sent when it starts serving page queries)
- `observeRpc` / `rpcObserverFor` / `RpcObserver` / `RpcCallRecord` / `RpcCallFilter` / `RpcInputPattern` (`rpc-observer.ts`): records the page's oRPC calls on its `/rpc-ws` socket by procedure path; supports mark, completed(filter), startedCount, completedCount, socketCount, dispose
- `rpcCallCursor` / `rpcCallMark` / `RpcCallCursor` (`rpc-counts.ts`): counts RPC calls since a mark: `startedSince` counts calls the page sent, `servedSince` counts calls the engine answered (a reply a fault injected is not served)
- `rpcSocketFor` / `RpcSocket` / `RpcSocketCall` / `RpcSocketRule` / `RpcSocketEvent` (`rpc-socket.ts`): one `page.routeWebSocket` per Page on `/rpc-ws` that forwards every frame, decodes oRPC requests and replies for listeners, lets rules forward, fail, hold or cut a call, can hold the whole socket down (`hold()` resolves once every open socket is closed), and can hold the engine's closes (`holdCloses`) until `releaseCloses` forwards them to the page with their code; a close from the page is forwarded to the engine (codes a browser WebSocket rejects are dropped), and each reply is decoded and emitted to listeners before the page receives it; await `installed` before the page opens its socket; an install cut short by a closing page rejects only for whoever awaits it, never as an unhandled rejection
- `watchRpcWire` / `RpcWireWatch` (`rpc-wire.ts`, async: installs the socket route first): waits for sessions.list and sessions.resolve traffic
- `failRpcCalls` / `abortRpcCalls` / `holdRpcCalls` / `gateRpcCalls` / `RpcFaultInjector` / `RpcHold` / `RpcGate` (`rpc-fault.ts`): socket-rule RPC fault injection (error reply, cut the socket, toggleable hold that closes and refuses the socket, capture-and-release gate that forwards or cuts on release)
- `garbleRpcReplies` (`rpc-fault.ts`): answers each call on the path (and, given an `input` pattern, only the calls whose input matches it, as `rpcCallCount` matches) with a reply the client cannot decode, so that one call rejects with a plain `Error` (not an `ORPCError`) while the socket stays open; `abortRpcCalls` instead closes the whole socket
- `failChatTurns` / `dropChatTurns` / `ChatTurnFault` (`chat-fault.ts`): `failRpcCalls` / `abortRpcCalls` on `chat.send`: a turn gets an error status (default 500), or its socket is closed
- `watchChatWire` / `ChatWireWatch` / `ChatTurnFrame` / `ChatTransport` / `ChatWirePart` (`chat-wire.ts`): captures each `chat.send` call on the page's rpc socket; exposes nextTurn and socket counters
- `samePath` (`rpc-payload.ts`, internal, no export subpath): compares two procedure paths
- `currentHref` (`navigation-state.ts`): reads the persisted navigation entry href through kit.rpc.navigation.get, '' if none
- `widgetComponentSuite` / `serveStaticDir` / `ServedDir` (`widget-suite.ts`): registers file-scoped vitest browser fixtures and three ConcivWidget tests (mounts one widget, toggle removes and restores it, settings prop remount)
- `makeHostGrab(doc)` / `makeImageHostGrab(dataUrl)` (`host/grab.ts`)

## Invariants

- `bootCoreKit` (`core-kit.ts`): throws if makeApp did not capture a runtime
- `pagePlaneWatchFor` (`page-plane.ts`): one watch per Page (WeakMap); the ready gate resets on main-frame navigation and rpc-socket close; subscribed() times out after 30s and throws if no `page.queries` stream yielded a 'ready'; the journal keeps at most 200 entries
- `rpcObserverFor` (`rpc-observer.ts`): one observer per Page (WeakMap); only calls on a socket opened after the route was installed are recorded; completed() checks buffered calls first and rejects after 30s by default; dispose rejects pending waiters
- `failRpcCalls`/`abortRpcCalls`/`gateRpcCalls` (`rpc-fault.ts`): only request frames are matched (trust, abort and iterator frames always pass); the gate's answered waits for status 200 within 15s and resolves with the engine's decoded answer (`output` on the observer's call record and the socket's `response` event), or rejects with 'the page gave up on this call before it was answered' when the page sent an abort frame for that call, before or after the answer reached the socket (`abandoned` on the record, the socket's `abort` event); oRPC sends that frame only while the call is still open on the page, so a late one still means the page never used the answer. An abort sent after the answer is seen only once a later frame on the same socket is, so await a later call first
- `watchChatWire` (`chat-wire.ts`): only frames that parse against the RunAgentInput schema are recorded; nextTurn rejects after 30s
- `serveStaticDir` (`widget-suite.ts`): returns 404 unless the resolved file is under dir and exists; close force-closes connections after 2s
- `makeHostGrab` (`host/grab.ts`): only elements with or inside `[data-tsd-source]` can be picked; `cancel` resolves the pending pick with null
- `parseSource` (`host/grab.ts`): `filePath:line:column` split on the last two colons

## Side Effects

- `serveStaticDir` (`widget-suite.ts`), `listenLocal` (`listen-local.ts`): bind HTTP servers on 127.0.0.1 and read files from disk
- `completeConnectHandshake` (`connect-handshake.ts`): dispatches the window CustomEvent 'embedtest:connect' and polls page's Definition (`experimental.page` `sessions.attached`) until the session is attached
- `failRpcCalls`/`abortRpcCalls`/`holdRpcCalls`/`gateRpcCalls` (`rpc-fault.ts`) and `failChatTurns`/`dropChatTurns` (`chat-fault.ts`): install socket rules or page.route interceptors (the socket route is never unrouted)
- `observeRpc` (`rpc-observer.ts`), `pagePlaneWatchFor` (`page-plane.ts`), `watchChatWire` (`chat-wire.ts`): attach Playwright page listeners; chat-wire never detaches them
- `makeHostGrab` (`host/grab.ts`): capture-phase document click listener

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin-testkit` from the repo root (turbo builds the package's dependencies first)
- Typecheck and lint: `cd packages/plugin-testkit && pnpm typecheck && pnpm lint`
