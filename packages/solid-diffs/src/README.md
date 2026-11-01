# solid-diffs/src

## Overview

Solid components that create `@pierre/diffs` `File` / `FileDiff` instances on a `<diffs-container>` element, hydrate them, and re-render them (throttled) when props change. Also manages a shared highlight worker pool built from an inlined Vite worker. Storybook demos: `code-block.stories.tsx`, `file-diff.stories.tsx`.

## Interface

- `SolidFileDiff` / `SolidFileDiffProps` `{oldFile, newFile, options?, class?, style?}` (`file-diff.tsx`).
- `SolidCodeBlock` / `SolidCodeBlockProps` `{file, options?, class?, style?}` (`code-block.tsx`).
- `SolidPatchDiff` / `SolidPatchDiffProps` `{patch, options?, class?, style?}` (`patch-diff.tsx`): parses `patch` with `getSingularPatch`.
- `primeHighlightWorkerPool(options)`, `DiffsRenderOptions` (Pick of `theme`, `useTokenTransformer`, `tokenizeMaxLineLength`, `lineDiffType`, `maxLineDiffLength`) (`worker-pool.ts`).
- Re-exports from `@pierre/diffs` (`index.tsx`): `registerCustomTheme`, types `CustomThemeLoader`, `FileContents`, `FileDiffOptions`, `FileOptions`.
- Internal: `syncRender({target, payload, options})` (`render-sync.ts`), `highlightWorkerPool(options)` (`worker-pool.ts`).
- `jsx.d.ts`: declares the `diffs-container` intrinsic element.

## Invariants

- Payload re-renders are throttled to `RENDER_INTERVAL_MS` = 100 (leading and trailing) through `createThrottledValue` (`render-sync.ts`).
- The first effect run only records options, since `hydrate` does the initial render (`primed`); later runs call `setOptions` and force a render only when the options reference changed.
- The worker pool is created only when `typeof Worker !== 'undefined'` (`highlightWorkerPool`, `primeHighlightWorkerPool`).
- The pool is a process-wide singleton (`getOrCreateWorkerPoolSingleton`) with `HIGHLIGHT_WORKER_COUNT` = 2; the first creator's highlighter options apply.
- Each component calls `instance.cleanUp()` in `onCleanup`.

## Side Effects

- Spawns 2 Web Workers from `@pierre/diffs/worker/worker-portable.js?worker&inline` (`worker-pool.ts`).
- `File` / `FileDiff.hydrate({fileContainer: node})` renders into the `<diffs-container>` element.
- `registerCustomTheme` registers themes in the `@pierre/diffs` global registry when called.

## Verification

- Run: `cd packages/solid-diffs && pnpm test`
