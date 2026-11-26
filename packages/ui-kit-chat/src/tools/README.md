# ui-kit-chat/src/tools

## Overview

Tool-call UI for the chat kit, split into headless `primitives` and themed `styled` components.

## Interface

- Subdirectories: [primitives](./primitives/README.md) - headless tool status and parsing; [styled](./styled/README.md) - themed tool cards. Both are published through `src/tools.tsx` (`./tools`).

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
