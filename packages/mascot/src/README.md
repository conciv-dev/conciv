# mascot/src

## Overview

Source root of `@conciv/mascot`. Its own files are the generated layer images (`layers.gen.ts`, imported by `core/skin.ts`) and the Storybook stories, one per effect; the service is in [core](./core/README.md) and the Solid wrapper in [solid](./solid/README.md).

## Invariants

- None

## Side Effects

- Stories mount the Solid mascot and effects in the Storybook DOM.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
