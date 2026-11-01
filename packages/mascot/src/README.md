# mascot/src

## Overview

Source root of `@conciv/mascot`. Its own files are the generated layer images and the Storybook stories; the service and wrappers are in the subdirectories.

## Interface

- `layers.gen.ts:robotLayers` - `{head, eyes, antenna}` PNG data URIs, imported by `core/skin.ts`.
- `*.stories.tsx` - Storybook stories titled `mascot/Core` and `mascot/Effects/<Name>`, one per effect.
- Subdirectories: [core](./core/README.md), [react](./react/README.md), [solid](./solid/README.md).

## Invariants

- None

## Side Effects

- Stories mount the Solid mascot and effects in the Storybook DOM.

## Verification

- Run: `cd packages/mascot && pnpm test` (vitest, then Playwright on `tests/e2e`)
- Run: `cd packages/mascot && pnpm typecheck`
