# design/src/tool

## Overview

client.ts attaches the browser-side capture and winner steps (imported from ../client/) to captureDef and winnerDef. server.ts attaches the six server steps from ./steps to their definitions in ../shared/defs.ts. Tool names come from defineTool as `design_${verb}`, which is defined in shared/defs.ts and not in this directory.

## Interface

- `CLIENT_TOOLS` (`client.ts`): readonly tuple of `captureDef.client(captureStep)` and `winnerDef.client(winnerStep)`, i.e. browser handlers for tools design_capture and design_winner
- `SERVER_STEPS` (`server.ts`): readonly tuple of server builders for design_target, design_diff, design_status, design_capture, design_winner and design_clear, typed `satisfies readonly AnyToolBuilder[]`
- Subdirectories:
  - [steps](./steps/README.md): Server-side handlers for the design_target, design_diff, design_status, design_capture, design_winner and design_clear tools; they call into the page and the design runtime (store, capture, matcher, mappers).

## Invariants

- `SERVER_STEPS` (`server.ts`) is type-checked with `satisfies readonly AnyToolBuilder[]` from @conciv/extension

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
