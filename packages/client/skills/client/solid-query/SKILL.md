---
name: solid-query
description: Use when fetching, caching, polling, or invalidating server data in apps/conciv or any Solid widget code — any rpc.* call in a component, a list that refreshes, a dialog that loads data on open, or an existing useMutation that only reads. Covers @tanstack/solid-query + oRPC query utils conventions for this repo.
---

# Solid Query in conciv

## Overview

Server reads are queries, server writes are mutations, and every query key comes from the oRPC utils. The one documented production failure this skill exists to prevent: the connect picker fetched its candidate list with `useMutation` plus a hand-rolled `['attach-readiness', …]` key — result: no cache, a full skeleton on every open, a frozen list rendered as live, and two competing sources for one read.

## The two rules that are never negotiated

1. **Reads = `useQuery`. Writes = `useMutation`.** "I only need it once when the dialog opens" is a read. "It returns data I then display" is a read. A mutation that calls a list/get procedure is wrong in review, no exceptions.
2. **Keys come from `appData.utils.<router>.<procedure>.queryOptions({input})`** (`createTanstackQueryUtils` — `packages/client/src/query-utils.ts`). Never write a key array by hand; hand-rolled keys silently miss every invalidation.

## Canonical call sites (copy these)

```ts
const list = useQuery(() => appData.utils.sessions.list.queryOptions()) // session-selector.tsx:63
const markers = useQuery(() => appData.utils.markers.list.queryOptions({input: {sessionId: props.sessionId}})) // chat-pane.tsx:152
const sessions = useQuery(() => ({...data.utils.sessions.list.queryOptions(), enabled: connected()})) // __root.tsx:163
await queryClient.ensureQueryData(data.utils.sessions.list.queryOptions()) // __root.tsx:169 (prefetch)
```

## Solid-specific mechanics (from @tanstack/solid-query source)

- `useQuery` takes a FUNCTION returning options; it is wrapped in `createMemo` (`useQuery.ts`). Reactivity comes from reading signals INSIDE that function (`enabled: open()`, input from a signal). A plain object argument is a type error; reading signals outside the function loses reactivity.
- The result is a Solid store updated via `reconcile` (`useBaseQuery.ts`). Access fields in JSX (`list.data`, `list.isPending`) for fine-grained updates. NEVER destructure the result — destructuring snapshots it dead.
- This app's `QueryClient` has NO default options (`apps/conciv/src/router.ts`). `staleTime`, `gcTime`, `retry`, `refetchInterval` are all explicit per call site — omitting them is a decision (staleTime 0, gcTime 5min defaults from query-core), not a neutral act.

## State vocabulary (drives the UI async matrix)

| Signal                                   | Meaning                       | UI cell                                   |
| ---------------------------------------- | ----------------------------- | ----------------------------------------- |
| `isLoading` (= isPending AND isFetching) | first load ever               | skeleton                                  |
| `isFetching && data`                     | background refresh            | subtle indicator, NEVER a skeleton        |
| `isError && !data`                       | failed, nothing cached        | error cell + retry                        |
| `isError && data`                        | refetch failed over good data | stale banner; freeze liveness affordances |
| `dataUpdatedAt`                          | freshness                     | "Checked Ns ago" honesty copy             |

For enabled-gated queries use `isLoading`, never bare `isPending` — a disabled query is pending forever, so an `isPending` skeleton flashes on every open even with cached data (in-repo precedent: `apps/conciv/src/composer/session-selector.tsx:230`).

Polling: `refetchInterval` accepts a function or `false` — gate it on visibility/step signals (`open() ? 4_000 : false`); add `refetchIntervalInBackground: false`.

## Invalidation

Use the app helper (`appData.invalidateSessions()`) or `queryClient.invalidateQueries(appData.utils.<x>.<y>.key())` in mutation `onSuccess`. If you wrote a mutation and invalidated nothing, say why in the diff or it is a review finding.

## Red flags — stop and fix

- `useMutation` whose procedure name reads like list/get/candidates/meta
- A key written as an array literal
- Destructured query result (`const {data} = useQuery(...)`)
- Options passed as an object, or signals read outside the options function
- Skeleton shown when cached data exists (`isPending` vs `isFetching` confused)
- A second query/mutation for data another call site already fetches — one read, one source
