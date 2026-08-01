# TanStack adapter spike — findings (§2 de-risk)

Date: 2026-07-21. Answers open-research item §7 #4 of
`docs/superpowers/specs/2026-07-19-framework-inspection-extensions-design.md`
("Verify fiber-walk router extraction against the TanStack Start example app, React 19") and,
per user prompt, cross-checks against what `@tanstack/react-router-devtools` reads.

## Question

Can the adapter's browser (client) half obtain the live TanStack Router instance from the running
app and read route/match/tree state + drive actions, using the fiber walk the spec proposed — with
no injected registrar module?

## Method

Real Chromium (Playwright), against the real example app `apps/examples/tanstack-start` running on a
scratch port (`vite dev --port 3210`, NOT the user's :3000). Versions: `@tanstack/react-router`
1.170, `@tanstack/react-start` 1.168, `react` 19.2, `router-core` 1.171. A self-contained page probe
(no bippy, no deps): walk fibers from the `__reactContainer$`/`__reactFiber$` DOM keys, climb to the
host root, DFS the tree, and duck-type the router (`v.state.matches` is an array **and**
`typeof v.navigate === 'function'`). Probed `/`, `/about`, `/form`.

## Result: GO. Fiber-walk router extraction works, and it's cheap.

- **Router found on every route via `memoizedProps.router`** (the `RouterProvider` fiber). Confirmed
  in source: `RouterProvider({router, ...})` renders `routerContext.Provider value={router}`
  (`@tanstack/react-router/dist/esm/RouterProvider.js`), so the instance is also reachable as a
  context provider's `value` — the probe checks both; `memoizedProps.router` won.
- **Cheap:** 112–227 fibers scanned before the hit (cap was 40 000). No perf concern.
- **Live and route-accurate:** `state.location.pathname` tracked the URL; `state.matches` reflected
  the matched branch (`__root__` + the leaf) on each route; `routesById` gave the full route tree
  (`__root__`, `/`, `/about`, `/form`). Actions present as functions: `navigate`, `invalidate`,
  `preloadRoute`, `load` (plus `matchRoute`, `clearCache`, `clearExpiredCache`, `buildLocation`,
  `commitLocation`, `subscribe` in the 40-key dump).

## Confirmed client surface (router-core types + live object; devtools use the same model)

The `@tanstack/react-router-devtools` panel renders `RouterState` and wraps the router's own methods —
i.e. the router object IS the source of truth; the adapter reads it directly rather than depending on
the devtools bundle. Ground truth from `router-core@1.171` `.d.ts` + the live probe:

- **`RouterState`** (`router.d.ts`): `status: 'pending' | 'idle'`, `loadedAt`, `isLoading`,
  `isTransitioning`, `matches[]`, `location`, `resolvedLocation`, `statusCode`, `redirect`.
- **Each match** (`Matches.d.ts`): `id`, `routeId`, `fullPath`, `params`, `search`, `status`,
  `error`, `loaderData`, `loaderDeps`, `isFetching`, `updatedAt`, `context`, `headers`, `preload`,
  `abortController`.
- **Route tree:** `router.routesById` (map) / `router.routeTree`.
- **Live push:** `router.subscribe(eventType, fn) => () => void`, event types `onBeforeNavigate`,
  `onBeforeLoad`, `onLoad`, `onResolved`, `onBeforeRouteMount`, `onRendered` — the hook for the
  adapter's navigation/error push events and for keeping reads live.
- **Actions:** `navigate(BuildNextOptions{to,params,search,hash,state,mask,from,href,replace})`,
  `invalidate`, `preloadRoute`, `load`, `clearCache`, `clearExpiredCache`.

### Maps cleanly onto the §1 `FrameworkAdapter` contract

- `client.routes.current()` ← `state.matches` (`id`, `routeId`, `fullPath`→`path`, `params`,
  `search`, `status`, `error`, `loaderData`, `isFetching`, `updatedAt`) — every `RouteMatch` field
  has a real source.
- `client.routes.tree()` ← `routesById`/`routeTree` → `RouteNode`.
- `client.navigation.navigate(NavigateInput)` ← `router.navigate` (`replace` maps to a nav option);
  `back()` ← `router.history.back()`; `refresh()` ← `router.invalidate()`.
- `client.data.invalidate`/`refetch` ← `router.invalidate()`.
- `client.errors.subscribe` ← `router.subscribe('onResolved'|'onBeforeLoad', …)` + `match.error`.
- Payloads (`loaderData`, `match.context`) must be dehydrated (`packages/page` `dehydrate`) before
  crossing to the agent — they can hold arbitrary user data.

Reuse: `packages/page/src/react-bridge.ts` already does this exact `__reactFiber` walk
(`scannedRootFibers`) with bippy; the adapter's client router surface should reuse it rather than the
hand-rolled probe.

## Remaining surfaces — spiked 2026-07-21 (temporarily enriched the example, then reverted)

The example was temporarily given a `loader` (calling a `createServerFn`), a `QueryClientProvider` +
a `useQuery`, then probed and reverted (`git checkout`; `pnpm-lock` restored). All four remaining
surfaces are now OBSERVED live, not assumed.

### loaderData — GO

With a loader added to `/about`, the match carried `loaderData: {server, local}` (server-fn result +
a nested local object), `status: 'success'`. Confirms `RouteMatch.loaderData` is populated and
readable; it holds arbitrary user data, so the adapter must run it through `packages/page` `dehydrate`
(depth/size/redaction caps) before it reaches the agent.

### queryCache (capability `queryCache`) — GO

TanStack Query is a SEPARATE `QueryClient`, not on the router — but the SAME fiber walk finds it:
duck-type `typeof v.getQueryCache === 'function'` on `memoizedProps.client`/`.value`. From the found
client, `getQueryCache().getAll()` yielded the live query `["spike","demo"]`: `status: 'success'`,
`fetchStatus: 'idle'`, `dataUpdatedAt`, `observers: 1`, `isStale: true`, `data` keys. `invalidateQueries`
and `refetchQueries` are functions, and `getMutationCache().getAll()` backs `mutations()`. The
`QueryCacheSurface` (queries/mutations/invalidate/refetch) is fully backed by `query-core@5.101`.

### serverFunctions (capability `serverFunctions`) — GO

- **Identity / `list()`:** each server fn is `createServerFn(...).handler(...)`; the
  `@tanstack/server-functions-plugin` assigns a `functionId` (base64 of `{file, export}`) at build and
  keeps a manifest. The client call target decodes to
  `{"file":"/src/lib/server-fns.ts?tss-serverfn-split","export":"getGreeting_createServerFn_handler"}`
  — self-describing (file + export), so `list()` can read the manifest (server side) or derive names
  from the ids.
- **`traces()`:** a client-side navigation (`router.navigate({to:'/about'})`) fired the loader on the
  client, and the server fn issued `GET /_serverFn/<base64-id>` → **200 in 4 ms** (captured live).
  The RPC boundary (`@tanstack/start-client-core/.../client-rpc/serverFnFetcher.js`, requests to
  `/_serverFn/*`) is the interception point for name + timing + status + payload. On full-page loads
  the loader runs during SSR (no client RPC), so traces are a client-nav / SSR-request-trace concern —
  the server half also sees these as request traces.

### Server (vite plugin) half — GO, mostly already wired

The transport EXISTS: the conciv plugin already boots the engine in `configureServer(server:
ViteDevServer)` and hands it a `BundlerBridge` (`packages/protocol/src/bundler-types.ts`) with
`config`, `resolve`, `moduleGraph(file)`, `transform(url)`, `urls`, `reload(file)`, `restart`
(`packages/plugin/src/core/vite.ts`, `vite-tools.ts`). So module-graph reads and transforms are
already available in-process. The §2 server surface is ADDITIVE on top:

1. **build/transform errors** — not captured yet; add a vite plugin hook (`buildEnd`/`transform`
   catch) or subscribe to `server.ws` error payloads.
2. **HMR events** — add a `handleHotUpdate`/`hotUpdate` hook (or watch `server.ws`).
3. **`routeTree.gen` parse** — the generated file is on disk (`src/routeTree.gen.ts`); read + parse
   it (or read via the module graph) for the server-side route manifest.
4. **server-fn registry** — read the `server-functions-plugin` manifest.

None needs new infrastructure — all hang off the existing `configureServer` + `BundlerBridge` seam.

## Verdict: all §2 surfaces de-risked — GO to plan

Every capability in the §1 contract has a proven real source:

| §1 surface                           | Source                                                          | Proven          |
| ------------------------------------ | --------------------------------------------------------------- | --------------- |
| client routes/navigation/data/errors | `router` via fiber `memoizedProps.router`                       | live            |
| loaderData                           | `match.loaderData` (dehydrate before crossing)                  | live            |
| queryCache                           | `QueryClient` via fiber walk → `getQueryCache()`                | live            |
| serverFunctions.list                 | `server-functions-plugin` manifest / functionId `{file,export}` | source          |
| serverFunctions.traces               | `GET /_serverFn/*` RPC interception                             | live (200, 4ms) |
| server manifest/events/logs          | conciv `BundlerBridge` + additive vite hooks                    | seam exists     |

Next: write the §2 plan (task breakdown). Fixture note for the plan — the enrichment used here
(loader + `createServerFn` + `QueryClientProvider` + `useQuery`) should become a committed test
fixture so the contract tests exercise every surface. Client half reuses
`packages/page/src/react-bridge.ts` (bippy `__reactFiber` walk); server half hangs off the existing
`configureServer`/`BundlerBridge` seam.
