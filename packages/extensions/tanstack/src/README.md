# tanstack/src

## Overview

client.tsx defines the browser extension. It registers `tanstackClientTools`, shows an inspector chip in the `status` slot, and installs runtime-error listeners for the extension's lifetime. server.ts defines the server extension. It subscribes to the bundler bridge to fill a build-error ring and a server-function trace ring, and returns a `makeAdapter` context that wraps those rings and the tool registry into a `FrameworkAdapter`. client-sentinel.ts holds the label strings for the status chip.

## Interface

- `tanstack` / default (`client.tsx`): client extension named `tanstack` with `tools: tanstackClientTools`, a `Component` that renders `InspectorChip` when `useSlot() === 'status'`, and `.client()` returning `{value: {}, dispose: installRuntimeErrorListeners()}`
- `CONCIV_TANSTACK_CLIENT_SENTINEL` (`client-sentinel.ts`, re-exported from `client.tsx`): the string 'TanStack'
- `CONCIV_TANSTACK_CLIENT_LABEL` (`client-sentinel.ts`): the string 'TanStack inspector active'
- `tanstack` / default (`server.ts`): server extension with `tools: tanstackServerTools` whose `.server()` returns `context.makeAdapter(tools)` -> `makeTanstackAdapter(...)` and a `dispose` that unsubscribes from the bundler
- Tools registered (defined in ../tool, not in this directory): tanstack_detect, tanstack_router_state, tanstack_route_tree, tanstack_data_entries, tanstack_loader_data, tanstack_data_invalidate, tanstack_errors_snapshot, tanstack_query_cache, tanstack_query_invalidate, tanstack_query_refetch, tanstack_navigate, tanstack_router_invalidate, tanstack_back, tanstack_build_errors, tanstack_route_manifest, tanstack_server_fn_trace
- Subdirectories:
  - [server](./server/README.md): Node-side helpers that build the TanStack `FrameworkAdapter` and supply it with build errors, server-function traces and a route manifest parsed from routeTree.gen.ts.
  - [client](./client/README.md): Browser-side code that finds the TanStack router and QueryClient in the page's React fiber tree, reads and changes their state, records runtime errors, and renders the status chip.
  - [tool](./tool/README.md): Defines the 16 `tanstack_*` agent tools (zod schemas plus metadata), binds them to browser-side router/query adapters or server-side framework-adapter handlers, and provides Solid card renderers and Storybook fixtures for their results.

## Invariants

- `buildErrors` (`server.ts`): throws `toolError('BUNDLER_UNAVAILABLE')` when `server.bundler.subscribe` is not a function
- bundler listener (`server.ts`): only diagnostics with `kind === 'build-error'` go into the diagnostics ring; every diagnostic goes to `serverFnRing.observe`
- `bundlerSubscribe` (`server.ts`): returns a no-op unsubscribe when no bundler exists
- `Component` (`client.tsx`): renders the chip only in the `status` slot

## Side Effects

- `tanstack` (`server.ts`): subscribes to `server.bundler` at setup and unsubscribes in `dispose`
- `routeManifest` (`server.ts`): reads `<server.cwd>/src/routeTree.gen.ts` from disk through `readRouteManifest`
- `tanstack` (`client.tsx`): adds window `error`/`unhandledrejection` listeners through `installRuntimeErrorListeners` and removes them on dispose

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-tanstack` from the repo root (turbo builds the package and its dependencies first)
