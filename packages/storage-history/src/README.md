# storage-history/src

## Overview

Implements `createWebStorageHistory`, an entries/index history stack on @tanstack/history's createHistory. Every change is written to a Web Storage key; corrupted or missing storage falls back to a single '/' entry.

## Interface

- `createWebStorageHistory({storage, key?})` (`storage-history.ts`): `key` defaults to `'conciv-history'`; `restore()` reads the storage again, replacing the entries and index, and notifies with a `REPLACE`, for a storage that is filled after the history is created.

## Invariants

- `MAX_ENTRIES` (`storage-history.ts`): 100, on push and on read; `trim` drops the oldest entries past this and shifts the index down (floored at 0)
- `isPersisted` (`storage-history.ts`): stored data must be {entries: non-empty array of {href, state?: {__TSR_index}}, index: integer}, otherwise [{href:'/'}] at index 0
- `readPersisted` (`storage-history.ts`): clamps the stored index to [0, entries.length-1]; a parse or getItem throw falls back to the default
- `rehydratedState` (`storage-history.ts`): rewrites __TSR_index to the array position; entries without state get a fresh {key, __TSR_index}
- `pushState` (`storage-history.ts`): drops forward entries before pushing when not at the end
- `back` / `forward` / `go` (`storage-history.ts`): index is clamped to [0, length-1]
- `persist` (`storage-history.ts`): setItem errors such as quota errors are swallowed

## Side Effects

- `persist` (`storage-history.ts`): storage.setItem(key, JSON) on every push, replace, back, forward and go
- `readPersisted` (`storage-history.ts`): storage.getItem(key) at creation and on every `restore()`
- `freshState` (`storage-history.ts`): calls crypto.randomUUID()

## Verification

- Typecheck and lint: `cd packages/storage-history && pnpm typecheck`, then `pnpm lint` at the repo root
