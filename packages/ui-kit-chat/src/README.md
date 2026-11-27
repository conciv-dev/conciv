# ui-kit-chat src

## Overview

Source root of `@conciv/ui-kit-chat`. `ui-kit-chat.tsx` is the main entry (store, primitives, behaviors, styled components); `tools.tsx` is the `./tools` entry (tool primitives, tool cards, trace components, fixtures).

## Interface

- `ui-kit-chat.tsx`: every primitive is re-exported, renamed `*Primitive` where a styled twin exists (for example `ThreadPrimitive`, `ComposerPrimitive`).
- `tools.tsx`: `CollapsibleCard` is not exported.
- `draft-storage.ts`: the `./draft-storage` entry. `icons/`: the icon registry.
- Subdirectories: [store](./store/README.md), [behaviors](./behaviors/README.md), [primitives](./primitives/README.md), [styled](./styled/README.md), [tools](./tools/README.md), [theme](./theme/README.md).

## Invariants

- `tsdown.config.ts` builds exactly five public entries from here: `ui-kit-chat`, `tools`, `draft-storage`, `theme/fonts`, `theme/code-theme`; anything not re-exported from them is internal.

## Side Effects

- None: the entry files only re-export.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
