# tools

## Overview

Tool-call UI for the chat kit, split into headless `primitives` and themed `styled` components. The one file here holds element-capture fixtures used by stories and tests.

## Interface

- `element-capture.fixtures.ts:ELEMENT_CAPTURE_FIXTURE_CSS`, `ELEMENT_CAPTURE_FIXTURE_FULL`, `ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE`, `ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER`, `ELEMENT_CAPTURE_FIXTURE_MASKED`, `ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY` - `ElementCapture` samples, re-exported from `src/tools.tsx`.
- Subdirectories: [primitives](./primitives/README.md) - headless tool status and parsing; [styled](./styled/README.md) - themed tool cards.

## Invariants

- Fixture data is static; it is shipped through the `./tools` entry.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
