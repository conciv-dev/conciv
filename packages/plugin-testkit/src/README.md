# plugin-testkit/src

## Overview

Test utilities for @conciv/plugin-testkit. They boot an in-process core kit around the fake model chat, listen on loopback, and supply wire observers and fault injectors for RPC, chat and push traffic, the ConcivWidget component suite and a click-based grab.

## Product path

The testkit runs the real product path. A page under test talks to the engine through the same transports and clients the product uses: browser rpc, chat turns included, goes over the partysocket `/rpc-ws` socket from `@conciv/contract`. The only fakes are the expensive externals: the LLM harness (a scripted fake harness) and the agent CLIs. Interception never swaps a transport: `rpc-socket.ts` routes the page's real `/rpc-ws` socket with `page.routeWebSocket` to observe calls or fault them (fail, hold, cut), and everything it does not fault reaches the engine unchanged. A node-side helper uses HTTP `/rpc` only where the product caller it stands in for is itself a node client, such as the CLI calling `registry.call`.

## Invariants

- `bootCoreKit` (`core-kit.ts`): throws if makeApp did not capture a runtime
- `completeConnectHandshake` (`connect-handshake.ts`): waits up to 30s for the 'connect pane ready' status, then up to 30s more for page's Definition (`plugin.call` `experimental.page` `sessions.attached`) to list the session
- `listenLocal` (`listen-local.ts`): binds 127.0.0.1 only
- `garbleRpcReplies` (`rpc-fault.ts`): the matched call rejects with a plain `Error` (not an `ORPCError`) while the socket stays open
- `samePath` (`rpc-payload.ts`) has no export subpath: it is internal to the wire helpers
- `rpcObserverFor` (`rpc-observer.ts`): one observer per Page (WeakMap); only calls on a socket opened after the route was installed are recorded; completed() checks buffered calls first and rejects after 30s by default; dispose rejects pending waiters
- `failRpcCalls`/`abortRpcCalls`/`gateRpcCalls` (`rpc-fault.ts`): only request frames are matched (trust, abort and iterator frames always pass); the gate's answered waits for status 200 within 15s and resolves with the engine's decoded answer (`output` on the observer's call record and the socket's `response` event), or rejects with 'the page gave up on this call before it was answered' when the page sent an abort frame for that call, before or after the answer reached the socket (`abandoned` on the record, the socket's `abort` event); oRPC sends that frame only while the call is still open on the page, so a late one still means the page never used the answer. An abort sent after the answer is seen only once a later frame on the same socket is, so await a later call first
- `watchChatWire` (`chat-wire.ts`): only frames that parse against the RunAgentInput schema are recorded; nextTurn rejects after 30s
- `serveStaticDir` (`widget-suite.ts`): returns 404 unless the resolved file is under dir and exists; close force-closes connections after 2s
- `makeHostGrab` (`host/grab.ts`): only elements with or inside `[data-tsd-source]` can be picked; `cancel` resolves the pending pick with null
- `parseSource` (`host/grab.ts`): `filePath:line:column` split on the last two colons

## Side Effects

- `serveStaticDir` (`widget-suite.ts`), `listenLocal` (`listen-local.ts`): bind HTTP servers on 127.0.0.1 and read files from disk
- `completeConnectHandshake` (`connect-handshake.ts`): dispatches the window CustomEvent 'embedtest:connect', calls the caller's `showSession`, and polls page's Definition (`experimental.page` `sessions.attached`) until the session is attached
- `failRpcCalls`/`abortRpcCalls`/`holdRpcCalls`/`gateRpcCalls` (`rpc-fault.ts`) and `failChatTurns`/`dropChatTurns` (`chat-fault.ts`): install socket rules or page.route interceptors (the socket route is never unrouted)
- `observeRpc` (`rpc-observer.ts`), `watchChatWire` (`chat-wire.ts`): attach Playwright page listeners; chat-wire never detaches them
- `makeHostGrab` (`host/grab.ts`): capture-phase document click listener

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin-testkit` from the repo root (turbo builds the package's dependencies first)
- Typecheck and lint: `cd packages/plugin-testkit && pnpm typecheck && pnpm lint`
