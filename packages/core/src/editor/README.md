# core/src/editor

## Overview

Opens source locations in an editor and debounces repeat opens.

## Interface

- `makeEditorOpener(launch, windowMs, now)` / `LaunchFn` / `OpenInEditor` (`open.ts`): skips repeat opens of the same file:line:column within `windowMs`
- `openSourceFromFrames(frames, symbolicate, open)` / `OpenSourceStatus` (`open-source.ts`): 'no-source', 'opened' or 'failed'

## Side Effects

- `makeEditorOpener` (`open.ts`): calls `launch`, which opens an editor

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck`, then `pnpm lint` at the repo root
