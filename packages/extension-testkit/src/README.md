# extension-testkit/src

## Overview

Test utilities for @conciv/extension-testkit (the root export points at get-extension-test-api.ts). They boot a real conciv core engine or an in-process core kit around an extension, serve a prebuilt Vite test host, launch Playwright Chromium, and supply wire observers and fault injectors for RPC, chat and push traffic, plus a Solid tool-card mount harness and a fake framework adapter.

## Interface

- `getExtensionTestApi` (`get-extension-test-api.ts`): boots the server, resolves a session, starts the host, launches the browser and returns `ExtensionTestApi` {page, callTool, callToolApproved, runTypescript, discoverTools, session, apiBase, serverContext, secondClient, dispose}; also re-exports `serveDir`, `ServedHost`, `fixtureHost`; types `HostEngine`, `HostHandle`, `ExtensionUnderTest`, `SecondClient`, `ExtensionTestApi`
- `bootExtensionServer` / `BootedServer` (`boot-server.ts`): runs `@conciv/core/start` with one extension on a temp stateRoot and returns {apiBase, extensionContexts, stop}
- `bootCoreKit` / `CoreKit` (`core-kit.ts`): builds a fake harness plus `makeApp` through `@conciv/harness-testkit` `createTestkit`, returning Kit & {harness, forSession}
- `fixtureHost` (`fixture-host.ts`): returns a host factory that serves a prebuilt host dist directory through `serveDir`
- `serveDir` / `ServedHost` (`serve.ts`): static server for a dir; in .html files it replaces `__CONCIV_API_BASE__` and `__CONCIV_SESSION__`
- `serveHost` (`serve-host.ts`): HTTP server that answers every request with html(url)
- `listenLocal` (`listen-local.ts`): listens on 127.0.0.1 (port 0 by default) and returns {base, port, close}
- `launch` / `openObservedPage` / `LaunchedPage` (`launch.ts`): launches Chromium and opens pages with an RPC observer and a page-plane watch attached
- `settleTeardown` / `TeardownStep` (`settle-teardown.ts`): runs teardown steps concurrently, each with its own timeout
- `mountToolCard` (`card-harness.tsx`): renders a Solid `ToolCardProps` component with a synthetic tool-call part (id 't1') and an optional tool-result
- `completeConnectHandshake` (`connect-handshake.ts`): waits for the 'connect pane ready' status, dispatches `embedtest:connect`, waits for the page-plane subscription, then calls RPC `registry.call` with page_text
- `pagePlaneWatchFor` / `awaitPagePlaneSubscribed` / `PagePlaneWatch` (`page-plane.ts`): per-page watch that resolves once the push socket on PUSH_WS_PATH sends a 'ready' frame
- `observeRpc` / `rpcObserverFor` / `RpcObserver` / `RpcCallRecord` / `RpcCallFilter` / `RpcInputPattern` (`rpc-observer.ts`): records HTTP oRPC calls by procedure path; supports mark, completed(filter), startedCount, completedCount, socketCount, dispose
- `rpcCallCursor` / `rpcCallMark` / `httpRpcRequestUrls` / `RpcCallCursor` (`rpc-counts.ts`): counts RPC calls since a mark and collects /rpc request URLs
- `watchRpcWire` / `RpcWireWatch` (`rpc-wire.ts`): waits for sessions.list and sessions.resolve traffic
- `failRpcCalls` / `abortRpcCalls` / `holdRpcCalls` / `gateRpcCalls` / `RpcFaultInjector` / `RpcHold` / `RpcGate` (`rpc-fault.ts`): Playwright route-based RPC fault injection (error status, abort, toggleable hold, capture-and-release gate)
- `failChatTurns` / `dropChatTurns` / `ChatTurnFault` (`chat-fault.ts`): makes POSTs to CHAT_SSE_PATH return an error status (default 500) or abort them
- `watchChatWire` / `ChatWireWatch` / `ChatTurnFrame` / `ChatTransport` / `ChatWirePart` (`chat-wire.ts`): captures chat turns sent over the CHAT_WS_PATH websocket or CHAT_SSE_PATH POSTs; exposes nextTurn and socket counters
- `watchPushWire` / `PushWireWatch` (`push-wire.ts`): counts push sockets and collects approval ids from 'chat' push frames
- `procedurePathOf` / `rpcPayload` (`rpc-payload.ts`): splits a URL path into decoded segments and deserializes an oRPC StandardRPC body
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
- `pagePlaneWatchFor` (`page-plane.ts`): one watch per Page (WeakMap); the ready gate resets on main-frame navigation and push-socket close; subscribed() times out after 30s and throws if the socket never sent a 'ready' frame; the journal keeps at most 200 entries
- `rpcObserverFor` (`rpc-observer.ts`): one observer per Page (WeakMap); only URLs containing '/rpc/' are recorded; completed() checks buffered calls first and rejects after 30s by default; dispose rejects pending waiters
- `failRpcCalls`/`abortRpcCalls`/`gateRpcCalls` (`rpc-fault.ts`): OPTIONS preflights always pass through; the gate's answered waits for status 200 within 15s
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
- `failRpcCalls`/`abortRpcCalls`/`holdRpcCalls`/`gateRpcCalls` (`rpc-fault.ts`) and `failChatTurns`/`dropChatTurns` (`chat-fault.ts`): install page.route interceptors (holdRpcCalls is never unrouted)
- `observeRpc` (`rpc-observer.ts`), `pagePlaneWatchFor` (`page-plane.ts`), `watchChatWire` (`chat-wire.ts`), `watchPushWire` (`push-wire.ts`): attach Playwright page listeners; chat-wire and push-wire never detach them
- `testHostConfig` (`test-host-config.ts`): the conciv build plugin reads process.cwd() as its default root; the build empties outDir

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-testkit` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/extension-testkit && pnpm typecheck && pnpm lint`
