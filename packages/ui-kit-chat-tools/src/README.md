# ui-kit-chat-tools/src

## Overview

The one entry `ui-kit-chat-tools.tsx` re-exports the tool primitives, the styled tool cards and the card lists: `builtinToolCards` (the harness tools), `concivToolCards` (`conciv-cards.tsx`: conciv's own `conciv_ui` and open-in-editor cards) and `coreToolCards` (`core-cards.tsx`: the `execute_typescript` card).

Subdirectories:

- primitives: [./primitives/README.md](./primitives/README.md) - headless tool primitives
- styled: [./styled/README.md](./styled/README.md) - styled tool cards
- conciv-cards: [./conciv-cards/README.md](./conciv-cards/README.md) - conciv's own cards
- core-cards: [./core-cards/README.md](./core-cards/README.md) - the code-mode card

## Invariants

- `ui-kit-chat-tools.tsx`: `bashTool`, `applyPatchTool`, `toolLookupTool` and `ToolLookupCard` are reachable only through `builtinToolCards`

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat-tools` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck`, then `pnpm lint` at the repo root
