# @conciv/brand

## Overview

Private package (`"private": true`, `"sideEffects": false`) that ships the conciv logo as Solid and React components plus static assets (`assets/favicon`, `assets/lockups`, `assets/marks`, `assets/social`, `assets/manifest.json`). Solid and React code are built and type-checked separately.

## Interface

- [src/README.md](./src/README.md): Storybook stories and brand guidelines; components in [src/react/README.md](./src/react/README.md) and [src/solid/README.md](./src/solid/README.md).
- `tests/browser/`: browser tests and their DOM helpers.
- `exports["./react"]` (`package.json`): `./dist/react.js` + `./dist/react.d.ts`, built by tsdown from `src/react/conciv-lockup.tsx`.
- `exports["./solid"]` (`package.json`): `./dist/solid.js` (vite lib entry `solid`) + `./dist/solid/conciv-lockup.d.ts` (tsc, `tsconfig.build.json`).
- `exports["./logos.json"]` -> `./assets/manifest.json`; `exports["./assets/*"]` -> raw asset files (`package.json`). `files` publishes `dist` and `assets`.
- Peer dependencies `react` ^19 and `solid-js` ^1.9.13, both optional (`peerDependenciesMeta`); runtime deps `motion`, `@solid-primitives/event-listener`.
- Vitest projects `brand-solid-browser` and `brand-react-browser` (`vitest.config.ts`): headless Playwright Chromium, `fileParallelism: false`.
- `uno.config.ts`: UnoCSS with `presetConciv()` from `@conciv/uno-preset`, scanning `src/**/*.{ts,tsx}`.
- Scripts: `build`, `typecheck`, `lint` (`oxlint`), `test` (`vitest run --passWithNoTests`).

## Invariants

- Build order is fixed by the `build` script: `vite build` first (`emptyOutDir: true`, `vite.config.ts`), then tsdown with `clean: false` (`tsdown.config.ts`) so vite output survives, then tsc with `emitDeclarationOnly` (`tsconfig.build.json`).
- The React bundle carries the `'use client';` banner and keeps `react`, `motion*` and `@conciv/*` external (`tsdown.config.ts` `banner` / `external`).
- The Solid bundle keeps `solid-js*` and `motion*` external (`vite.config.ts` `rollupOptions.external`).
- Solid and React are type-checked under separate JSX configs: `tsconfig.json` (`jsxImportSource: solid-js`, `jsx: preserve`) and `tsconfig.react.json` (`jsx: react-jsx`); `typecheck` runs both.

## Side Effects

- `build` wipes and rewrites `dist/` (`vite.config.ts` `emptyOutDir: true`, then tsdown and tsc).
- `test` launches headless Chromium through `playwright({})` (`vitest.config.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/brand` from the repo root (turbo builds the package and its dependencies first)
- Also: `pnpm typecheck`, `pnpm lint`
