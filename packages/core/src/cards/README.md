# core/src/cards

## Overview

Solid tool card for `execute_typescript` calls: code, console logs, result and errors, in full and embedded layouts, plus its Storybook stories.

## Interface

- `CodeRunCard` (`code-run-card.tsx`): Solid component taking `ToolCardProps`
- `codeRunTool` (`code-run-card.tsx`): `ToolCardEntry` for `[EXECUTE_TOOL_NAME]` with `hasEmbeddedBody`
- Stories `Running`, `Success`, `Failure`, `TransportFailure`, `ObjectResult`, `StringResult`, `Themed`, `EmbeddedSuccess`, `EmbeddedVoidResult`, `EmbeddedFailure` (`code-run-card.stories.tsx`)

## Invariants

- `parseOutput` (`code-run-card.tsx`): null when the result fails `ExecuteResultSchema`
- `isFailed` (`code-run-card.tsx`): uses `success === false` when output parses, otherwise tool status 'error'

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
