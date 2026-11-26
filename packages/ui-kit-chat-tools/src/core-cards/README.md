# ui-kit-chat-tools/src/core-cards

## Overview

Solid tool card for `execute_typescript` calls: code, console logs, result and errors, in full and embedded layouts, plus its Storybook stories.

## Interface

- `code-run-card.tsx`: `CodeRunCard` and its `codeRunTool` entry for `EXECUTE_TOOL_NAME` (`@conciv/protocol/execute-schemas`), listed in `../core-cards.tsx` as `coreToolCards`; `code-run-card.stories.tsx` holds its stories.

## Invariants

- `parseOutput` (`code-run-card.tsx`): null when the result fails `ExecuteResultSchema`
- `isFailed` (`code-run-card.tsx`): uses `success === false` when output parses, otherwise tool status 'error'

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat-tools` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck`, then `pnpm lint` at the repo root
