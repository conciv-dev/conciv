# grab/src

## Overview

`grab.ts` defines the element-grab types and two label helpers.

## Interface

- Types `ElementSource`, `ElementRect`, `DomPreview` (kind `'dom'`), `ImagePreview` (kind `'image'`), `GrabPreview`, `GrabSourceLoc`, `Grab` (`grab.ts`).
- Type `GrabFrame`, re-exported from `@conciv/plugin/experimental/grab`, which owns it (`grab.ts`).
- `GrabActions` `{pick, comment, cancel, isActive, grabbable?}`; `GrabProvider` = `() => GrabActions` (`grab.ts`).
- `sourceLabel(source)` (`grab.ts`): `'<component> at <file>:<line>'`, shortened when parts are missing.
- `composeGrabText(snippet, source, fallback)` (`grab.ts`): `'<snippet> at <file>:<line>:<col>'`, or `fallback` when either input is missing.

## Invariants

- `sourceLabel` drops the location when `filePath === ''` (`whereLabel`, `grab.ts`).

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/grab` from the repo root (turbo builds the package and its dependencies first)
