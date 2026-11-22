# @conciv/brand

## Overview

Private package (`"private": true`, `"sideEffects": false`) that ships the conciv logo as Solid components plus static assets (`assets/favicon`, `assets/lockups`, `assets/marks`, `assets/social`, `assets/manifest.json`). The React components are the separate `@conciv/brand-react` package.

## Interface

- [src/README.md](./src/README.md): Storybook stories and brand guidelines; components in [src/solid/README.md](./src/solid/README.md).
- `exports["./solid"]` (`package.json`): `./dist/solid.js` (vite lib entry `solid`) + `./dist/solid/conciv-lockup.d.ts` (tsc, `tsconfig.build.json`).
- `exports["./logos.json"]` -> `./assets/manifest.json`; `exports["./assets/*"]` -> raw asset files (`package.json`). `files` publishes `dist` and `assets`.
- Peer dependency `solid-js` ^1.9.13, optional (`peerDependenciesMeta`); runtime deps `motion`, `@solid-primitives/event-listener`.
- `uno.config.ts`: UnoCSS with `presetConciv()` from `@conciv/uno-preset`, scanning `src/**/*.{ts,tsx}`.
- Scripts: `build`, `typecheck`, `lint` (`oxlint`).

## Invariants

- Build order is fixed by the `build` script: `vite build` first (`emptyOutDir: true`, `vite.config.ts`), then tsc with `emitDeclarationOnly` (`tsconfig.build.json`).
- The Solid bundle keeps `solid-js*` and `motion*` external (`vite.config.ts` `rollupOptions.external`).

## Side Effects

- `build` wipes and rewrites `dist/` (`vite.config.ts` `emptyOutDir: true`, then tsc).

## Verification

- Also: `pnpm typecheck`, `pnpm lint`
