# extension-testkit/src

## Overview

Test utilities for @conciv/extension-testkit (the root export points at get-extension-test-api.ts). They boot a real conciv core engine around an extension, serve a prebuilt Vite test host and launch Playwright Chromium, plus a Solid tool-card mount harness and a fake framework adapter. The core kit, wire observers and fault injectors live in `@conciv/plugin-testkit`.

## Product path

The testkit runs the real product path. A page under test talks to the engine through the same transports and clients the product uses: browser rpc goes over the partysocket `/rpc-ws` socket from `@conciv/contract`, chat over the chat socket, push over the push socket. The only fakes are the expensive externals: the LLM harness (a scripted fake harness) and the agent CLIs. Interception never swaps a transport: `@conciv/plugin-testkit/rpc-socket` routes the page's real `/rpc-ws` socket with `page.routeWebSocket` to observe calls or fault them (fail, hold, cut), and everything it does not fault reaches the engine unchanged. A node-side helper uses HTTP `/rpc` only where the product caller it stands in for is itself a node client, such as the CLI calling `registry.call`.

## Interface

- `getExtensionTestApi` (`get-extension-test-api.ts`): boots the server, resolves a session, starts the host on the plain engine origin, launches the browser on a `#conciv_otp` magic link and returns `ExtensionTestApi` {page, callTool, callToolApproved, runTypescript, discoverTools, session, apiBase, serverContext, secondClient, dispose}; also re-exports `serveDir`, `ServedHost`, `fixtureHost`; types `HostEngine`, `HostHandle`, `ExtensionUnderTest`, `SecondClient`, `ExtensionTestApi`
- `bootExtensionServer` / `BootedServer` (`boot-server.ts`): runs `@conciv/core/start` with one extension on a temp stateRoot and returns {apiBase (the agent `/t/<agentToken>` base), origin, terminal, extensionContexts, stop}
- `fixtureHost` (`fixture-host.ts`): returns a host factory that serves a prebuilt host dist directory through `serveDir`
- `serveDir` / `ServedHost` (`serve.ts`): static server for a dir; in .html files it replaces `__CONCIV_API_BASE__` and `__CONCIV_SESSION__`
- `serveHost` (`serve-host.ts`): HTTP server that answers every request with html(url)
- `launch` / `openObservedPage` / `LaunchedPage` (`launch.ts`): launches Chromium and opens pages with an RPC observer and a page-plane watch attached
- `settleTeardown` / `TeardownStep` (`settle-teardown.ts`): runs teardown steps concurrently, each with its own timeout
- `mountToolCard` (`card-harness.tsx`): renders a Solid `ToolCardProps` component with a synthetic tool-call part (id 't1') and an optional tool-result
- `makeFakeFrameworkAdapter` / `FrameworkAdapterOverrides` (`framework-fake.ts`): `defineFrameworkAdapter` with canned tanstack-start client, server, queryCache and serverFunctions data, deep-merged with overrides
- `testHostConfig` / `TestHostConfigOptions` (`test-host-config.ts`): Vite UserConfig for the test host (default root ./host) wiring the conciv build plugin with NO_BUILTINS, a `virtual:conciv-extension-under-test` module, UnoCSS presetConciv, solid and a 'shiki' chunk group
- Subdirectories:
  - host: [./host/README.md](./host/README.md) - the test host page

## Invariants

- `fixtureHost` (`fixture-host.ts`): throws 'prebuilt test host missing at ... run this package's build first' if hostDist does not exist
- `settleTeardown` (`settle-teardown.ts`): every step runs even if another fails; each step times out after 20s by default; the first rejection is rethrown after all steps settle
- `getExtensionTestApi` (`get-extension-test-api.ts`): dispose tears down browser, host and server through settleTeardown; serverContext is keyed by extension.server.name
- `serveDir` (`serve.ts`): strips leading '../' segments after normalize; any read error returns 404

## Side Effects

- `bootExtensionServer` (`boot-server.ts`): creates a temp dir `conciv-testkit-*` under os.tmpdir() and starts a core engine HTTP server
- `launch` (`launch.ts`): launches a Chromium browser process and navigates pages
- `serveDir` (`serve.ts`), `serveHost` (`serve-host.ts`): bind HTTP servers on 127.0.0.1 and read files from disk
- `mountToolCard` (`card-harness.tsx`): appends to document.body; a module-level vitest afterEach disposes renders and clears document.body
- `testHostConfig` (`test-host-config.ts`): the conciv build plugin reads process.cwd() as its default root; the build empties outDir

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-testkit` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/extension-testkit && pnpm typecheck && pnpm lint`
