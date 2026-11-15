# core/src/editor

## Overview

Opens source locations in an editor. It debounces repeat opens, symbolicates stack frames with `@conciv/plugin-page`'s `symbolicateFrames`, and opens the first resolved frame outside node_modules.

## Interface

- `makeEditorOpener(launch, windowMs, now)` / `LaunchFn` / `OpenInEditor` (`open.ts`): skips repeat opens of the same file:line:column within `windowMs`
- `openSourceFromFrames(frames, root, open)` / `OpenSourceStatus` (`open-source.ts`): 'no-source', 'opened' or 'failed'

## Invariants

- `openSourceFromFrames` (`open-source.ts`): drops frames without a string `fileName`

## Side Effects

- `makeEditorOpener` (`open.ts`): calls `launch`, which opens an editor

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
