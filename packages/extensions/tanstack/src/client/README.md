# tanstack/src/client

## Overview

router-adapter.ts walks React root fibers from `rootFibers()` (@conciv/page) to find a router prop, then maps its matches, location, route tree and loader data into @conciv/protocol framework types. It also performs navigate, invalidate and back. query-adapter.ts reuses `findInFibers` to find a QueryClient through a `client` or `value` prop, and reads or changes its query and mutation caches. error-ring.ts keeps a module-level buffer of runtime errors. inspector-chip.tsx and tanstack-logo.tsx are Solid UI components. The tool handlers in ../tool/client.ts call these functions.

## Interface

- `findInFibers` (`router-adapter.ts`): walks every root fiber depth-first and returns the first non-null result of `pick`
- `Fiber` (`router-adapter.ts`): minimal fiber type with memoizedProps, child and sibling
- `readRouterState` (`router-adapter.ts`): returns `RouterCurrent` (location pathname/searchStr/hash and the mapped matches)
- `readDetect` (`router-adapter.ts`): returns `{name: 'tanstack-start', version: null, router: 'file-based', dev: true}` once a router is found
- `readDataEntries` (`router-adapter.ts`): returns the router matches as `CacheEntry`s keyed by routeId
- `readRouteTree` (`router-adapter.ts`): returns a `RouteNode` tree built from `routeTree`, or from `routesById['__root__']` as a fallback
- `readLoaderData` (`router-adapter.ts`): returns the dehydrated loaderData for the given routeId, or for the leaf match when no routeId is given
- `navigateTo` (`router-adapter.ts`): calls `router.navigate` with to/params/search/replace
- `invalidateRouter` / `invalidateRouterMatch` (`router-adapter.ts`): call `router.invalidate`, optionally filtered to one routeId
- `goBack` (`router-adapter.ts`): calls `router.history.back()`
- `readQueryCache` / `readMutations` (`query-adapter.ts`): map the query and mutation caches to `CacheEntry[]`
- `invalidateQuery` / `refetchQuery` (`query-adapter.ts`): find the query whose JSON.stringify(queryKey) equals `key` and invalidate or refetch it
- `readRuntimeErrors` (`error-ring.ts`): returns a copy of the stored runtime `AppError`s
- `installRuntimeErrorListeners` (`error-ring.ts`): adds window error listeners and returns a cleanup function
- `InspectorChip` (`inspector-chip.tsx`): span with role=status, the logo, `CONCIV_TANSTACK_CLIENT_LABEL` and a matching tooltip
- `TanStackLogo` (`tanstack-logo.tsx`): SVG logo whose gradient, filter and mask ids are made unique with `createUniqueId`

## Invariants

- `walkFromRoot` (`router-adapter.ts`): stops after `MAX_FIBER_NODES` = 50,000 fibers per root
- `mapRoute` (`router-adapter.ts`): stops recursing at `MAX_TREE_DEPTH` = 20 and records the cut-off child count in `truncated`
- `isTanstackRouter` (`router-adapter.ts`): a router is accepted only if `state.matches` is an array and `navigate` is a function
- `requireRouter` (`router-adapter.ts`): throws 'TanStack router not found on page'; `readRouteTree` throws the same message when no root route exists
- `invalidateRouter`/`invalidateRouterMatch` (`router-adapter.ts`): throw when `router.invalidate` is not a function; `goBack` throws when `history.back` is missing
- `toStatus` (`router-adapter.ts`): any status other than success/error/notFound/redirected becomes 'pending'
- `routeKind` (`router-adapter.ts`): isRoot -> layout, '' or '/' -> index, last segment '$' -> catch-all, '$'-prefixed segment -> dynamic, anything else -> static
- `requireQueryClient` (`query-adapter.ts`): throws 'TanStack QueryClient not found on page'; a candidate needs a `getQueryCache` function
- `queryState` (`query-adapter.ts`): checked in order fetching > error > stale (`isStale()`) > fresh
- `invalidateQuery`/`refetchQuery` (`query-adapter.ts`): return `{ok: true}` without doing anything when no key matches
- `push` (`error-ring.ts`): keeps only the last `CAPACITY` = 50 errors

## Side Effects

- `installRuntimeErrorListeners` (`error-ring.ts`): adds window `error` and `unhandledrejection` listeners
- `push` (`error-ring.ts`): changes the module-level `stored` array (global state)
- `navigateTo`/`goBack` (`router-adapter.ts`): change the page's router navigation and history
- `invalidateRouter`/`invalidateRouterMatch` (`router-adapter.ts`): make the router reload its loaders
- `invalidateQuery`/`refetchQuery` (`query-adapter.ts`): make the page's QueryClient invalidate or refetch queries, which can trigger network requests

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-tanstack` from the repo root (turbo builds the package and its dependencies first)
