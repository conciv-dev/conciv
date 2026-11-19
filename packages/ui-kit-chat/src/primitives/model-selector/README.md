# primitives/model-selector

## Overview

The harness model menu's state and its row building, rendered by `styled/harness-model-selector.tsx`.

## Interface

- `model-menu.ts`: the harness model menu's state (`useModelMenu`, type `ModelMenu`, `ModelSwitchTarget`) and its pure row building (harness sections, the 4-row cap, older-version groups, search, effort levels); rendered by `styled/harness-model-selector.tsx`.

## Invariants

- `model-menu.ts` holds no DOM; the popover machine comes from `@conciv/ui-kit-system` `usePopover`.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
