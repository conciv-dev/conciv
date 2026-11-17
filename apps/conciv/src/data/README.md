# data

## Overview

Widget settings parsing, the query-utils wrapper over the rpc client, and the per-session harness queries.

## Interface

- `parseConcivSettings(raw)` (`settings.ts`): parses a JSON string into `ConcivSettings`; exported as `@conciv/app/settings`
- `ConcivSettings`, `Launcher` types (`settings.ts`): `modal`, `quickTerminal`, `defaultOpen`, `launcher`, `surface`, `transport`
- `makeAppData(rpc, queryClient)` (`app-data.ts`): returns `{utils, invalidateSessions, invalidateSession, seedSession, createSession, invalidateOutsideAccess}` built on `makeQueryUtils` from `@conciv/client`
- `AppData` type (`app-data.ts`)
- `useSessionModels`, `useSessionHarness` (`harness-meta.ts`): `meta.models` for a session and its harness metadata (`ChatModels['harness']`)
- `useHarnesses` (`harness-meta.ts`): `meta.harnesses` (each harness with its models) as `list`, `switchable` (more than one) and `resolveName(id)`
- `useRefetchSessionHarness` (`harness-meta.ts`): refetches a session's `meta.models`, `meta.commands`, `sessions.list`, `sessions.search` and its `sessions.get`, inactive queries included

## Invariants

- `settings.ts:parseConcivSettings`: invalid or empty JSON yields defaults; `modal` and `quickTerminal` are enabled unless set to `false`; `defaultOpen` only when exactly `true`
- `settings.ts:parsePosition`: position must be one of six `PositionSchema` values, default `bottom-right`
- `settings.ts:parseLauncher`: `false` and `'native'` are kept, anything else becomes `'mascot'`
- `settings.ts:parseHotkeys`: default hotkey list is `['Mod+`']`
- `settings.ts:parseTransport`: `auto` | `websocket` | `fetch`, anything else becomes `auto`
- `settings.ts:parseConcivSettings`: `surface` is `dock` only when exactly `'dock'`, otherwise `page`

## Side Effects

- `app-data.ts:invalidateSessions`: invalidates the `sessions.list`, `sessions.search` and every `sessions.get` query in the TanStack QueryClient; a fetch already running is cancelled and replaced, so each ends on data read after the invalidation
- `app-data.ts:invalidateSession`: the same for one session: `sessions.list`, `sessions.search` and that session's `sessions.get`; every action that changes one session (rename, model, effort, compact, create, delete, a run that ends) calls it
- `app-data.ts` `session.deleted` (read from `client.event.subscribe` for the app's lifetime): marks the session's cached `sessions.get` meta `hidden: true`, as the engine answers for a tombstoned session (`AppData.sessionDeleted` reads it), ends the session's draft saves (`endDraftSaves`), removes its local draft from `conciv-drafts`, and drops it from the cached session lists; a mounted pane's draft writer stops on `sessionDeleted` (`pane/README.md`)
- `app-data.ts:forgetGoneDrafts`: once per start, when the engine connection is first trusted (`router.tsx` `watchEngine`, through `once`), each local draft in `conciv-drafts` (`DraftStore.keys`) is checked one at a time with `sessions.get`; only a session the engine answers with `hidden: true` (its own tombstone: deleted while this browser was away) loses its local draft (`removeItem`; its image blobs go with the source's sweep of unreferenced blobs when the store next opens); `NOT_FOUND` means this engine never had the session (a draft of another engine on the same page origin), so like any other failed check it is logged and removes nothing
- `app-data.ts:seedSession`: writes a row the caller already holds (the picker's list or search row) into that session's `sessions.get` cache only when the cache has none, then invalidates that `sessions.get`, so the panel draws at once and still ends on the real row
- `app-data.ts:createSession`: the one way to start a session (panel header, extension view, pane provider, quick terminal): calls `rpc.sessions.create`, seeds the returned row into `sessions.get` and runs `invalidateSession`
- `app-data.ts:makeAppData`: `sessions.list`, `sessions.search` and `sessions.get` never refetch on window focus (#720); freshness comes from `invalidateSessions` and `invalidateSession`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
