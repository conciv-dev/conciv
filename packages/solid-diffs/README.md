# @conciv/solid-diffs

SolidJS wrappers around @pierre/diffs: thin Solid components over the framework-agnostic FileDiff / File web-component renderers (Shiki-highlighted diffs + code), reusable across the conciv UI.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- [src/README.md](./src/README.md): the components and the highlight worker pool.
- `exports["."]` -> `./dist/solid-diffs.js` + `./dist/solid-diffs.d.ts`; `files: ["dist"]`; peer `solid-js`; deps `@pierre/diffs` 1.6.2, `@tanstack/solid-pacer` (`package.json`).
- `tsdown.config.ts`: entry `src/solid-diffs.tsx`, with `unplugin-solid/rolldown`.
- Scripts: `build` (`tsdown`), `typecheck`, `publint`, `attw` (`--profile esm-only`). No `test` script.

## Invariants

- The `@pierre/diffs` highlight worker (`?worker&inline`) is bundled inline by `inlineImports()` (`@internal/build-plugins`); every other `@pierre/diffs` import, `solid-js` and `@tanstack/solid-pacer` stay external, because they are its dependencies and peer (tsdown's default).
- `tsconfig.build.json` emits declarations only, excluding `*.stories.*`, `fixtures.*` and `*.test.*`.

## Side Effects

- `build` writes `dist/`. Runtime effects (Web Workers, DOM rendering) are in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/solid-diffs` from the repo root
