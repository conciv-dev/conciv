# core/src/editor

## Overview

Opens source locations in an editor. It debounces repeat opens, symbolicates stack frames through source maps (local files under the project root, or loopback HTTP only), and opens the first resolved frame outside node_modules.

## Interface

- `makeEditorOpener(launch, windowMs, now)` / `LaunchFn` / `OpenInEditor` (`open.ts`): skips repeat opens of the same file:line within `windowMs`
- `symbolicateFrame` / `symbolicateFrames` / `RawFrame` / `SourceLoc` (`symbolicate.ts`): map frames to original source with @jridgewell/trace-mapping
- `openSourceFromFrames(frames, root, open)` / `OpenSourceStatus` (`open-source.ts`): 'no-source', 'opened' or 'failed'

## Invariants

- `readFileInRoot` (`symbolicate.ts`): throws on a realpath outside the project root
- `fetchLoopback` (`symbolicate.ts`): refuses hosts other than localhost, 127.0.0.1, ::1 or [::1]
- `symbolicateFrames` (`symbolicate.ts`): skips node_modules results; `symbolicateFrame` returns null on any error
- `openSourceFromFrames` (`open-source.ts`): drops frames without a string `fileName`

## Side Effects

- `symbolicate.ts`: reads files and fetches source maps over loopback HTTP
- `makeEditorOpener` (`open.ts`): calls `launch`, which opens an editor

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
