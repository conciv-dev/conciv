# grab/src

## Overview

`grab.ts` re-exports the element-grab types from `@conciv/frontend-plugin-api/grab`, which owns them, and defines the picker shape (`GrabActions`, `GrabProvider`) and two label helpers.

## Invariants

- `sourceLabel` drops the location when `filePath === ''` (`whereLabel`, `grab.ts`).
- `composeGrabText` answers `fallback` when the snippet or the source is missing.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/grab` from the repo root (turbo builds the package and its dependencies first)
