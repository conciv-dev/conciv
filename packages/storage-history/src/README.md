# storage-history/src

## Overview

Implements `createWebStorageHistory`, an entries/index history stack on @tanstack/history's createHistory. Every change is written to a Web Storage key; corrupted or missing storage falls back to a single '/' entry.

## Interface

- `createWebStorageHistory(opts: {storage, key?}): RouterHistory` (`index.ts`): key defaults to 'conciv-history'
- `WebStorage` type (`index.ts`): Pick&lt;Storage, 'getItem' | 'setItem'&gt;

## Invariants

- `MAX_ENTRIES` (`index.ts`): 100; `trim` drops the oldest entries past this and shifts the index down (floored at 0)
- `isPersisted` (`index.ts`): stored data must be {entries: non-empty array of {href, state?: {__TSR_index}}, index: integer}, otherwise [{href:'/'}] at index 0
- `readPersisted` (`index.ts`): clamps the stored index to [0, entries.length-1]; a parse or getItem throw falls back to the default
- `rehydratedState` (`index.ts`): rewrites __TSR_index to the array position; entries without state get a fresh {key, __TSR_index}
- `pushState` (`index.ts`): drops forward entries before pushing when not at the end
- `back` / `forward` / `go` (`index.ts`): index is clamped to [0, length-1]
- `persist` (`index.ts`): setItem errors such as quota errors are swallowed

## Side Effects

- `persist` (`index.ts`): storage.setItem(key, JSON) on every push, replace, back, forward and go
- `readPersisted` (`index.ts`): storage.getItem(key) once at creation
- `freshState` (`index.ts`): calls crypto.randomUUID()

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/storage-history` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/storage-history && pnpm typecheck && pnpm lint`
