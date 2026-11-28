# @internal/brand

## Overview

Private package (`"private": true`, `"sideEffects": false`) that ships the conciv logo as Solid components plus static assets (`assets/favicon`, `assets/lockups`, `assets/marks`, `assets/social`, `assets/manifest.json`). The React components are the separate `@internal/brand-react` package.

## Interface

- [src/README.md](./src/README.md): Storybook stories and brand guidelines; components in [src/solid/README.md](./src/solid/README.md).
- `exports["./solid"]` (`package.json`): `import` from `./dist/solid.js` (tsdown entry `solid`), `types` from `./src/solid/conciv-lockup.tsx`.
- `exports["./logos.json"]` -> `./assets/manifest.json`; `exports["./assets/*"]` -> raw asset files (`package.json`). `files` publishes `dist` and `assets`.
- Peer dependency `solid-js` ^1.9.13, optional (`peerDependenciesMeta`); runtime deps `motion`, `@solid-primitives/event-listener`.
- `uno.config.ts`: UnoCSS with `presetConciv()` from `@internal/uno-preset`, scanning `src/**/*.{ts,tsx}`.
- Scripts: `build`, `typecheck`.

## Invariants

- `build` is `tsdown` alone: it writes the JavaScript and the declarations (`dts: true`, from `tsconfig.build.json`), with `unplugin-solid/rolldown` for the JSX (`tsdown.config.ts`).
- The Solid bundle keeps `solid-js` and `motion` external because they are its peer and runtime dependencies (tsdown's default).

## Side Effects

- `build` wipes and rewrites `dist/` (tsdown cleans `dist/` before it writes).

## Verification

- Typecheck: `pnpm exec turbo run typecheck --filter=@internal/brand` from the repo root (the package has no tests yet)
