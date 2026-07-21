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

## Gaps this spike did NOT cover (inputs for the §2 plan)

The example app is minimal — **no route loaders, no TanStack Query, no server functions** (grepped:
zero `loader:`, zero `QueryClient`/`useQuery`, zero `createServerFn`). Therefore UNSPIKED:

1. **`loaderData` shape** — every match here has `loaderData: undefined`. Need a route with a loader
   in the fixture to see real dehydrated loader data.
2. **`queryCache` surface** (capability `queryCache`) — TanStack Query is a SEPARATE `QueryClient`,
   not the router; must be found on its own (Query has its own devtools/`QueryClient` global or
   context). Not present to observe.
3. **`serverFunctions` surface + traces** — no `createServerFn` to intercept.
4. **Server (vite plugin) half** entirely — `routeTree.gen` parse, module graph, build/HMR errors,
   SSR traces. Different process (in-process with the dev server), needs its own spike.

## Recommendation

Client router surface is de-risked → **GO** for the §2 client half. Before writing §2:
- Enrich the example fixture (or add a dedicated test app): one route with a `loader`, a
  `QueryClient` + a `useQuery`, and one `createServerFn` — so the loader-data, query-cache, and
  server-fn surfaces are observable, not assumed.
- Spike the server (vite plugin) half separately; it's the other half of §2 and shares nothing with
  the fiber walk.
