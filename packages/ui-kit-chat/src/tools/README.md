# tools

## Overview

Tool-call UI for the chat kit, split into headless `primitives` and themed `styled` components.

## Interface

- `element-capture.fixtures.ts:ELEMENT_CAPTURE_FIXTURE_CSS`, `ELEMENT_CAPTURE_FIXTURE_FULL`, `ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE`, `ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER`, `ELEMENT_CAPTURE_FIXTURE_MASKED`, `ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY` - `ElementCapture` samples, re-exported from `src/tools.tsx`.
- Subdirectories: [primitives](./primitives/README.md) - headless tool status and parsing; [styled](./styled/README.md) - themed tool cards.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
