# @conciv/solid-diffs

SolidJS wrappers around @pierre/diffs: thin Solid components over the framework-agnostic FileDiff / File web-component renderers (Shiki-highlighted diffs + code), reusable across the conciv UI.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- [src/README.md](./src/README.md): `SolidFileDiff`, `SolidCodeBlock`, `SolidPatchDiff`, `primeHighlightWorkerPool` and re-exported `@pierre/diffs` APIs.
- `exports["."]` -> `./dist/index.js` + `./dist/index.d.ts`; `files: ["dist"]`; peer `solid-js` ^1.9.13; deps `@pierre/diffs` 1.6.2, `@tanstack/solid-pacer` 0.24.0 (`package.json`).
- `vite.config.ts`: `solidLibConfig` from `@conciv/vitest-config/vite-lib`, entry `src/index.tsx`.
- Scripts: `build` (`vite build && tsc -p tsconfig.build.json`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw` (`--profile esm-only`).

## Invariants

- The `@pierre/diffs` worker (`?worker` import) is bundled inline; other `@pierre/diffs` imports, `solid-js`, `shiki`, `@shikijs/*` and `@tanstack/solid-pacer` stay external (`vite.config.ts`).
- `tsconfig.build.json` emits declarations only, excluding `*.stories.*`, `fixtures.*` and `*.test.*`.

## Side Effects

- `build` writes `dist/`. Runtime effects (Web Workers, DOM rendering) are in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `cd packages/solid-diffs && pnpm test`
