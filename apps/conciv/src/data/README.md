# data

## Overview

Widget settings parsing, the query-utils wrapper over the rpc client, and the per-session harness queries.

## Interface

- `parseConcivSettings(raw)` (`settings.ts`): parses a JSON string into `ConcivSettings`
- `ConcivSettings`, `Launcher` types (`settings.ts`): `modal`, `quickTerminal`, `defaultOpen`, `launcher`, `surface`
- `makeAppData(rpc, queryClient, drafts, lockedOut, server)` (`app-data.ts`): returns `{utils, invalidateSessions, invalidateSession, seedSession, createSession}` built on `makeQueryUtils` from `@conciv/client`
- `AppData` type (`app-data.ts`)
- `useSessionModels`, `useSessionHarness` (`harness-meta.ts`): `meta.models` for a session and its harness metadata (`ChatModels['harness']`)
- `useHarnesses` (`harness-meta.ts`): `meta.harnesses` (each harness with its models) as `list`, `switchable` (more than one) and `resolveName(id)`
- `useRefetchSessionHarness` (`harness-meta.ts`): refetches a session's `meta.models`, `meta.commands`, `sessions.list`, `sessions.search` and its `sessions.get`, inactive queries included

## Invariants

- `settings.ts:parseConcivSettings`: invalid or empty JSON yields defaults; `modal` and `quickTerminal` are enabled unless set to `false`; `defaultOpen` only when exactly `true`
- `settings.ts:parsePosition`: position must be one of six `PositionSchema` values, default `bottom-right`
- `settings.ts:parseLauncher`: `false` and `'native'` are kept, anything else becomes `'mascot'`
- `settings.ts:parseHotkeys`: default hotkey list is `['Mod+`']`
- `settings.ts:parseConcivSettings`: `surface` is `dock` only when exactly `'dock'`, otherwise `page`

## Side Effects

- `app-data.ts:invalidateSessions`: invalidates the `sessions.list`, `sessions.search` and every `sessions.get` query in the TanStack QueryClient; a fetch already running is cancelled and replaced, so each ends on data read after the invalidation; the plugin root (`runtime/plugin/root.tsx`) runs it on every `server.connected` the event stream sends (`bundle-source.ts` `onSessionsChanged`), so a delete made while the widget had no live subscription is seen once it subscribes, and runs `invalidateSession` on each `session.deleted`
- `app-data.ts:invalidateSession`: the same for one session: `sessions.list`, `sessions.search` and that session's `sessions.get`; every action that changes one session (rename, model, effort, compact, create, delete, a run that ends) calls it
- `app-data.ts` `session.deleted` (read from `client.event.subscribe` for the app's lifetime): marks the session's cached `sessions.get` meta `hidden: true`, as the engine answers for a tombstoned session (`AppData.sessionDeleted` reads it), ends the session's draft saves (`endDraftSaves`), and drops it from the cached session lists; it leaves the session's local draft in `conciv-drafts`, because the deleted session panel (`pane/deleted-session-panel.tsx`) reads that text to move it to a new session, and `clearMovedDraft` (`pane/draft-storage.ts`) removes it after the move; otherwise only `forgetGoneDrafts` at a later start removes it, and never while an open pane shows that session; a mounted pane's draft writer stops its engine saves on `sessionDeleted` and still writes the text on screen to the local draft (`pane/README.md`)
- `app-data.ts:forgetLocalDrafts`: empties the local draft store `conciv-drafts`, its documents and its blobs (`DraftStore.clear`), and drops this tab's draft leaving copies in `sessionStorage` (`dropLeavingCopies`), when the trust this browser held is revoked (`router.tsx` `watchEngine`); a draft the engine never saved is gone on a revoke, an untrusted load (no token held) clears nothing, so one tab loading before its code exchange never empties the drafts of the other tabs, and nothing else in the page origin is touched; a failed clear is logged; it first removes every cached `drafts.get` answer, because a failed save leaves its row in that cache and a panel opened after a new code would paint it, and every `drafts.set` save that is not paused (`removeDraftSaves`, the helper `endDraftSaves` goes through too): the settled ones and the one on the wire, whose 401 is often what locked this browser, so it cannot settle as a failed save after the clear and raise `DraftUnsavedNotice` again once a new code unlocks the panel; a paused save stays, so its `scope` still moves on to it and it answers null; while `lockedOut` (passed in by `router.tsx`, the watched connection's trust is untrusted or revoked) a `drafts.set` save neither writes the cache in `onMutate` nor calls the engine (`mutationFn` answers null, so `saveDraft` answers false), which also ends a save already queued or retried when the trust ended; a save the engine refuses with `UNAUTHORIZED` (it answered before this browser knew it was untrusted, as right after a rebind while the trust check is still out) fails like any other but is not logged, because the lock notice tells the user; every other failure is logged
- `app-data.ts:forgetGoneDrafts`: once per start, when the engine connection is first trusted (`router.tsx` `watchEngine`, through `once`), each local draft in `conciv-drafts` (`DraftStore.keys`) other than those of the sessions an open pane shows at that moment (the router's matches for its latest location: the `/panel/$sessionId` and `/pip/$sessionId` param and the quick terminal's `panes`), whose deleted session panel moves them, is checked one at a time with `sessions.get`; only a session the engine answers with `hidden: true` (its own tombstone: deleted while this browser was away) loses its local draft (`removeItem`; its image blobs go with the source's sweep of unreferenced blobs when the store next opens); `NOT_FOUND` means this engine never had the session (a draft of another engine on the same page origin), so like any other failed check it is logged and removes nothing
- `app-data.ts:seedSession`: writes a row the caller already holds (the picker's list or search row) into that session's `sessions.get` cache only when the cache has none, then invalidates that `sessions.get`, so the panel draws at once and still ends on the real row
- `app-data.ts:createSession`: the one way to start a session (panel header, pane provider, quick terminal): calls `rpc.sessions.create`, seeds the returned row into `sessions.get` and runs `invalidateSession`
- `app-data.ts:makeAppData`: `sessions.list`, `sessions.search` and `sessions.get` never refetch on window focus (#720); freshness comes from `invalidateSessions` and `invalidateSession`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
