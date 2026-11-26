# @conciv/solid-diffs

SolidJS wrappers around @pierre/diffs: thin Solid components over the framework-agnostic FileDiff / File web-component renderers (Shiki-highlighted diffs + code), reusable across the conciv UI.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- [src/README.md](./src/README.md): the components and the highlight worker pool.
- `exports["."]` -> `./dist/solid-diffs.js` + `./dist/solid-diffs.d.ts`; `files: ["dist"]`; peer `solid-js`; deps `@pierre/diffs` 1.6.2, `@tanstack/solid-pacer` (`package.json`).
- `vite.config.ts`: `solidLibConfig` from `@internal/vite-config`, entry `src/solid-diffs.tsx`.
- Scripts: `build` (`vite build && tsc -p tsconfig.build.json`), `typecheck`, `publint`, `attw` (`--profile esm-only`). No `test` script.

## Invariants

- The `@pierre/diffs` worker (`?worker` import) is bundled inline; other `@pierre/diffs` imports, `solid-js`, `shiki`, `@shikijs/*` and `@tanstack/solid-pacer` stay external (`vite.config.ts`).
- `tsconfig.build.json` emits declarations only, excluding `*.stories.*`, `fixtures.*` and `*.test.*`.

## Side Effects

- `build` writes `dist/`. Runtime effects (Web Workers, DOM rendering) are in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/solid-diffs` from the repo root
