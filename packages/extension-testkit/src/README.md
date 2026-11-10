# extension-testkit/src

## Overview

Test utilities for @conciv/extension-testkit (the root export points at get-extension-test-api.ts). They boot a real conciv core engine or an in-process core kit around an extension, serve a prebuilt Vite test host, launch Playwright Chromium, and supply wire observers and fault injectors for RPC, chat and push traffic, plus a Solid tool-card mount harness and a fake framework adapter.

## Interface

- `getExtensionTestApi` (`get-extension-test-api.ts`): boots the server, resolves a session, starts the host on the plain engine origin, launches the browser on a `#conciv_otp` magic link and returns `ExtensionTestApi` {page, callTool, callToolApproved, runTypescript, discoverTools, session, apiBase, serverContext, secondClient, dispose}; also re-exports `serveDir`, `ServedHost`, `fixtureHost`; types `HostEngine`, `HostHandle`, `ExtensionUnderTest`, `SecondClient`, `ExtensionTestApi`
- `bootExtensionServer` / `BootedServer` (`boot-server.ts`): runs `@conciv/core/start` with one extension on a temp stateRoot and returns {apiBase (the agent `/t/<agentToken>` base), origin, terminal, extensionContexts, stop}
- `bootCoreKit` / `CoreKit` (`core-kit.ts`): builds a fake harness plus `makeApp` through `@conciv/harness-testkit` `createTestkit`, returning Kit & {harness, forSession, rpcServed}; `resumeBin` names the bin of the fake's resume command (default the harness id); `rpcServed(path)` counts HTTP RPC calls to that procedure (CORS preflights excluded) whose response the server has produced, so it is ordered before the page sees the reply
- `fixtureHost` (`fixture-host.ts`): returns a host factory that serves a prebuilt host dist directory through `serveDir`
- `serveDir` / `ServedHost` (`serve.ts`): static server for a dir; in .html files it replaces `__CONCIV_API_BASE__` and `__CONCIV_SESSION__`
- `serveHost` (`serve-host.ts`): HTTP server that answers every request with html(url)
- `listenLocal` (`listen-local.ts`): listens on 127.0.0.1 (port 0 by default) and returns {base, port, close}
- `launch` / `openObservedPage` / `LaunchedPage` (`launch.ts`): launches Chromium and opens pages with an RPC observer and a page-plane watch attached
- `settleTeardown` / `TeardownStep` (`settle-teardown.ts`): runs teardown steps concurrently, each with its own timeout
- `mountToolCard` (`card-harness.tsx`): renders a Solid `ToolCardProps` component with a synthetic tool-call part (id 't1') and an optional tool-result
- `completeConnectHandshake` (`connect-handshake.ts`): waits for the 'connect pane ready' status, dispatches `embedtest:connect`, waits for the page-plane subscription, then calls RPC `registry.call` with page_text
- `pagePlaneWatchFor` / `awaitPagePlaneSubscribed` / `PagePlaneWatch` (`page-plane.ts`): per-page watch that resolves once any push socket on PUSH_WS_PATH sends a 'ready' frame (sent when the socket starts serving page queries)
- `observeRpc` / `rpcObserverFor` / `RpcObserver` / `RpcCallRecord` / `RpcCallFilter` / `RpcInputPattern` (`rpc-observer.ts`): records the page's oRPC calls on its `/rpc-ws` socket by procedure path; supports mark, completed(filter), startedCount, completedCount, socketCount, dispose
- `rpcCallCursor` / `rpcCallMark` / `RpcCallCursor` (`rpc-counts.ts`): counts RPC calls since a mark
- `rpcSocketFor` / `RpcSocket` / `RpcSocketCall` / `RpcSocketRule` / `RpcSocketEvent` (`rpc-socket.ts`): one `page.routeWebSocket` per Page on `/rpc-ws` that forwards every frame, decodes oRPC requests and replies for listeners, lets rules forward, fail, hold or cut a call, and can hold the whole socket down; await `installed` before the page opens its socket; an install cut short by a closing page rejects only for whoever awaits it, never as an unhandled rejection
- `watchRpcWire` / `RpcWireWatch` (`rpc-wire.ts`, async: installs the socket route first): waits for sessions.list and sessions.resolve traffic
- `failRpcCalls` / `abortRpcCalls` / `holdRpcCalls` / `gateRpcCalls` / `RpcFaultInjector` / `RpcHold` / `RpcGate` (`rpc-fault.ts`): socket-rule RPC fault injection (error reply, cut the socket, toggleable hold that closes and refuses the socket, capture-and-release gate that forwards or cuts on release)
- `failChatTurns` / `dropChatTurns` / `ChatTurnFault` (`chat-fault.ts`): makes POSTs to CHAT_SSE_PATH return an error status (default 500) or abort them
- `watchChatWire` / `ChatWireWatch` / `ChatTurnFrame` / `ChatTransport` / `ChatWirePart` (`chat-wire.ts`): captures chat turns sent over the CHAT_WS_PATH websocket or CHAT_SSE_PATH POSTs; exposes nextTurn and socket counters
- `watchPushWire` / `PushWireWatch` (`push-wire.ts`): counts push sockets and collects approval ids from 'chat' push frames
- `procedurePathOf` / `samePath` (`rpc-payload.ts`): reads the decoded procedure path from an `/rpc/` URL (null otherwise) and compares two paths
- `makeFakeFrameworkAdapter` / `FrameworkAdapterOverrides` (`framework-fake.ts`): `defineFrameworkAdapter` with canned tanstack-start client, server, queryCache and serverFunctions data, deep-merged with overrides
- `currentHref` (`navigation-state.ts`): reads the persisted navigation entry href through kit.rpc.navigation.get, '' if none
- `testHostConfig` / `TestHostConfigOptions` (`test-host-config.ts`): Vite UserConfig for the test host (default root ./host) wiring the conciv build plugin with NO_BUILTINS, a `virtual:conciv-extension-under-test` module, UnoCSS presetConciv, solid and a 'shiki' chunk group
- `widgetComponentSuite` / `serveStaticDir` / `ServedDir` (`widget-suite.ts`): registers file-scoped vitest browser fixtures and three ConcivWidget tests (mounts one widget, toggle removes and restores it, settings prop remount)
- Subdirectories:
  - host: [./host/README.md](./host/README.md) - the test host page

## Invariants

- `fixtureHost` (`fixture-host.ts`): throws 'prebuilt test host missing at ... run this package's build first' if hostDist does not exist
- `bootCoreKit` (`core-kit.ts`): throws if makeApp did not capture a runtime
- `settleTeardown` (`settle-teardown.ts`): every step runs even if another fails; each step times out after 20s by default; the first rejection is rethrown after all steps settle
- `getExtensionTestApi` (`get-extension-test-api.ts`): dispose tears down browser, host and server through settleTeardown; serverContext is keyed by extension.server.name
- `pagePlaneWatchFor` (`page-plane.ts`): one watch per Page (WeakMap); the ready gate resets on main-frame navigation and push-socket close; subscribed() times out after 30s and throws if no push socket sent a 'ready' frame; the journal keeps at most 200 entries
- `rpcObserverFor` (`rpc-observer.ts`): one observer per Page (WeakMap); only calls on a socket opened after the route was installed are recorded; completed() checks buffered calls first and rejects after 30s by default; dispose rejects pending waiters
- `failRpcCalls`/`abortRpcCalls`/`gateRpcCalls` (`rpc-fault.ts`): only request frames are matched (trust, abort and iterator frames always pass); the gate's answered waits for status 200 within 15s
- `failChatTurns`/`dropChatTurns` (`chat-fault.ts`): only POST requests are faulted; the request's origin is echoed in CORS headers
- `watchChatWire` (`chat-wire.ts`): only frames that parse against the RunAgentInput schema are recorded; nextTurn rejects after 30s
- `serveDir` (`serve.ts`): strips leading '../' segments after normalize; any read error returns 404
- `serveStaticDir` (`widget-suite.ts`): returns 404 unless the resolved file is under dir and exists; close force-closes connections after 2s

## Side Effects

- `bootExtensionServer` (`boot-server.ts`): creates a temp dir `conciv-testkit-*` under os.tmpdir() and starts a core engine HTTP server
- `launch` (`launch.ts`): launches a Chromium browser process and navigates pages
- `serveDir` (`serve.ts`), `serveHost` (`serve-host.ts`), `serveStaticDir` (`widget-suite.ts`), `listenLocal` (`listen-local.ts`): bind HTTP servers on 127.0.0.1 and read files from disk
- `mountToolCard` (`card-harness.tsx`): appends to document.body; a module-level vitest afterEach disposes renders and clears document.body
- `completeConnectHandshake` (`connect-handshake.ts`): dispatches the window CustomEvent 'embedtest:connect' and calls RPC registry.call
- `failRpcCalls`/`abortRpcCalls`/`holdRpcCalls`/`gateRpcCalls` (`rpc-fault.ts`) and `failChatTurns`/`dropChatTurns` (`chat-fault.ts`): install socket rules or page.route interceptors (the socket route is never unrouted)
- `observeRpc` (`rpc-observer.ts`), `pagePlaneWatchFor` (`page-plane.ts`), `watchChatWire` (`chat-wire.ts`), `watchPushWire` (`push-wire.ts`): attach Playwright page listeners; chat-wire and push-wire never detach them
- `testHostConfig` (`test-host-config.ts`): the conciv build plugin reads process.cwd() as its default root; the build empties outDir

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-testkit` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/extension-testkit && pnpm typecheck && pnpm lint`
