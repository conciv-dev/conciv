# mascot

## Overview

Storybook gallery for `@conciv/mascot`: a playground, the compound component and an index of parts, effects and wrappers.

## Invariants

- `mascot-gallery.stories.tsx:Index.play`: asserts the text `16 effects`; adding or removing a `@conciv/mascot/effects/*` import requires updating it
- `mascot-gallery.stories.tsx:Compound.play`: exactly one `head`, `antenna`, `eyes` and `effect` part is rendered

## Side Effects

- `mascot-gallery.stories.tsx`: `onCleanup(() => service.destroy())` tears down the mascot service on unmount

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=conciv-storybook` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
