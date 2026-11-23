# tools

## Overview

Tool-call UI for the chat kit, split into headless `primitives` and themed `styled` components.

## Interface

- Subdirectories: [primitives](./primitives/README.md) - headless tool status and parsing; [styled](./styled/README.md) - themed tool cards.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
