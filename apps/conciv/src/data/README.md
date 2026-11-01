# data

## Overview

Widget settings parsing, the query-utils wrapper over the rpc client, and the harness metadata context.

## Interface

- `parseConcivSettings(raw)` (`settings.ts`): parses a JSON string into `ConcivSettings`; exported as `@conciv/app/settings`
- `ConcivSettings`, `Launcher` types (`settings.ts`): `modal`, `quickTerminal`, `defaultOpen`, `launcher`, `surface`, `transport`
- `makeAppData(rpc, hub, queryClient)` (`app-data.ts`): returns `{utils, invalidateSessions}` built on `makeQueryUtils` from `@conciv/client`, with groups in `DEVFRAME_GROUPS` sent through the hub
- `AppData` type (`app-data.ts`)
- `HarnessMetaContext`, `createHarnessMeta`, `useHarnessMeta` (`harness-meta.ts`): harness metadata (`ChatModels['harness']`) accessor

## Invariants

- `settings.ts:parseConcivSettings`: invalid or empty JSON yields defaults; `modal` and `quickTerminal` are enabled unless set to `false`; `defaultOpen` only when exactly `true`
- `settings.ts:positionOf`: position must be one of six `PositionSchema` values, default `bottom-right`
- `settings.ts:launcherOf`: `false` and `'native'` are kept, anything else becomes `'mascot'`
- `settings.ts:hotkeysOf`: default hotkey list is `['Mod+`']`
- `settings.ts:transportOf`: `auto` | `websocket` | `fetch`, anything else becomes `auto`
- `settings.ts:parseConcivSettings`: `surface` is `dock` only when exactly `'dock'`, otherwise `page`
- `harness-meta.ts:useHarnessMeta`: throws `useHarnessMeta called outside the app provider`

## Side Effects

- `app-data.ts:invalidateSessions`: invalidates the `sessions.list` query in the TanStack QueryClient

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
