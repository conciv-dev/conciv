# data

## Overview

Widget settings parsing, the query-utils wrapper over the rpc client, and the per-session harness queries.

## Interface

- `parseConcivSettings(raw)` (`settings.ts`): parses a JSON string into `ConcivSettings`; exported as `@conciv/app/settings`
- `ConcivSettings`, `Launcher` types (`settings.ts`): `modal`, `quickTerminal`, `defaultOpen`, `launcher`, `surface`, `transport`
- `makeAppData(rpc, queryClient)` (`app-data.ts`): returns `{utils, invalidateSessions}` built on `makeQueryUtils` from `@conciv/client`
- `AppData` type (`app-data.ts`)
- `useSessionModels`, `useSessionHarness` (`harness-meta.ts`): `meta.models` for a session and its harness metadata (`ChatModels['harness']`)
- `useHarnesses` (`harness-meta.ts`): `meta.harnesses` (each harness with its models) as `list`, `switchable` (more than one) and `nameOf(id)`
- `useRefetchSessionHarness` (`harness-meta.ts`): refetches a session's `meta.models`, `meta.commands` and `sessions.list`, inactive queries included

## Invariants

- `settings.ts:parseConcivSettings`: invalid or empty JSON yields defaults; `modal` and `quickTerminal` are enabled unless set to `false`; `defaultOpen` only when exactly `true`
- `settings.ts:positionOf`: position must be one of six `PositionSchema` values, default `bottom-right`
- `settings.ts:launcherOf`: `false` and `'native'` are kept, anything else becomes `'mascot'`
- `settings.ts:hotkeysOf`: default hotkey list is `['Mod+`']`
- `settings.ts:transportOf`: `auto` | `websocket` | `fetch`, anything else becomes `auto`
- `settings.ts:parseConcivSettings`: `surface` is `dock` only when exactly `'dock'`, otherwise `page`

## Side Effects

- `app-data.ts:invalidateSessions`: invalidates the `sessions.list` query in the TanStack QueryClient without cancelling an in-flight fetch (`cancelRefetch: false`)
- `app-data.ts:makeAppData`: sets `sessions.list` query defaults once for every observer: 30 s `staleTime`, no refetch on window focus; freshness comes from `invalidateSessions`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
