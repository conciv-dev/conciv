---
name: solid-query
description: Use when fetching, caching, polling, or invalidating server data in the widget shell (packages/frontend-defaults), a plugin's browser part, or any Solid widget code, any rpc.* call in a component, a list that refreshes, a dialog that loads data on open, or an existing useMutation that only reads. Covers @tanstack/solid-query + oRPC query utils conventions for this repo.
---

# Solid Query in conciv

## Overview

Server reads are queries, server writes are mutations, and every query key comes from the oRPC utils. The one documented production failure this skill exists to prevent: the connect picker fetched its candidate list with `useMutation` plus a hand-rolled `['attach-readiness', …]` key: result: no cache, a full skeleton on every open, a frozen list rendered as live, and two competing sources for one read.

## Imports

Import every TanStack Query hook, `QueryClient` and `QueryClientProvider` from `@conciv/client` (`packages/client/src/client.ts:6-22`), and build query utils with its `makeQueryUtils` (`packages/client/src/client.ts:30-32`), never from `@tanstack/solid-query`, `@tanstack/query-core` or `@orpc/tanstack-query` (a lint error from the `no-restricted-imports` rule in the repo-root `.oxlintrc.json`). `@conciv/client` bundles the single patched copy (TanStack/query#11230) that the widget and every plugin share.

## The two rules that are never negotiated

1. **Reads = `useQuery`. Writes = `useMutation`.** "I only need it once when the dialog opens" is a read. "It returns data I then display" is a read. A mutation that calls a list/get procedure is wrong in review, no exceptions.
2. **Keys come from `appData.utils.<router>.<procedure>.queryOptions({input})`** (`makeQueryUtils` wraps oRPC's `createTanstackQueryUtils`, `packages/client/src/client.ts:30-32`). Never write a key array by hand; hand-rolled keys silently miss every invalidation.

## Canonical call sites (copy these)

From `packages/frontend-defaults/src/pane/chat-pane.tsx:456`:

```ts
const markers = useQuery(() => appData.utils.markers.list.queryOptions({input: {sessionId}}))
```

A query `enabled` only while `connected()`, from `packages/frontend-defaults/src/app/warm-session.ts:11-14`:

```ts
const newest = useQuery(
  () => ({...data.utils.sessions.list.queryOptions({input: {limit: 1}}), enabled: connected()}),
  client,
)
```

From `packages/frontend-defaults/src/routes/panel.$sessionId.tsx:93-94` (a prefetch in a route's `beforeLoad`):

```ts
const resolved = await context.queryClient.ensureQueryData(
  context.data.utils.sessions.resolve.queryOptions({input: {id: params.sessionId}}),
)
```

A live read is a query too: `useQuery(() => appData.utils.sessions.changes.experimental_liveOptions())`
(`packages/frontend-defaults/src/composer/session-selector.tsx:157`).

## Solid-specific mechanics (from @tanstack/solid-query source)

- `useQuery` takes a FUNCTION returning options; it is wrapped in `createMemo` (`useQuery.ts`). Reactivity comes from reading signals INSIDE that function (`enabled: open()`, input from a signal). A plain object argument is a type error; reading signals outside the function loses reactivity.
- The result is a Solid store updated via `reconcile` (`useBaseQuery.ts`). Access fields in JSX (`list.data`, `list.isPending`) for fine-grained updates. NEVER destructure the result: destructuring snapshots it dead.
- This app's `QueryClient` defaults every query to `staleTime: Infinity` and `refetchOnWindowFocus: 'always'` (`packages/frontend-defaults/src/router.tsx:173`). Data changes only three ways: a server push (`experimental_liveOptions`), an invalidation at the action of ours that changed it, or a window refocus. Never add a per-query `staleTime` to make data refresh; invalidate it where we change it, or poll with `refetchInterval` where the server changes it with no push. An explicit `refetchOnWindowFocus: true` turns the refocus refetch OFF under an infinite staleTime; use `'always'` or leave the default.

## State vocabulary (drives the UI async matrix)

| Signal                                   | Meaning                       | UI cell                                   |
| ---------------------------------------- | ----------------------------- | ----------------------------------------- |
| `isLoading` (= isPending AND isFetching) | first load ever               | skeleton                                  |
| `isFetching && data`                     | background refresh            | subtle indicator, NEVER a skeleton        |
| `isError && !data`                       | failed, nothing cached        | error cell + retry                        |
| `isError && data`                        | refetch failed over good data | stale banner; freeze liveness affordances |
| `dataUpdatedAt`                          | freshness                     | "Checked Ns ago" honesty copy             |

For enabled-gated queries use `isLoading`, never bare `isPending`: a disabled query is pending forever, so an `isPending` skeleton flashes on every open even with cached data (in-repo precedent: `packages/frontend-defaults/src/composer/session-selector.tsx:390`).

Polling: `refetchInterval` accepts a function or `false`: gate it on visibility/step signals (`open() ? 4_000 : false`); add `refetchIntervalInBackground: false`.

## Invalidation

Use the app helper (`appData.invalidateSession(sessionId)` when one session changed, `appData.invalidateSessions()` only to refresh them all; `packages/frontend-defaults/src/data/app-data.ts:82-83`) or `queryClient.invalidateQueries(appData.utils.<x>.<y>.key())` in mutation `onSuccess`. If you wrote a mutation and invalidated nothing, say why in the diff or it is a review finding.

## Red flags: stop and fix

- `useMutation` whose procedure name reads like list/get/candidates/meta
- A key written as an array literal
- Destructured query result (`const {data} = useQuery(...)`)
- Options passed as an object, or signals read outside the options function
- Skeleton shown when cached data exists (`isPending` vs `isFetching` confused)
- A second query/mutation for data another call site already fetches: one read, one source
