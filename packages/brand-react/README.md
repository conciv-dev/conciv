# @internal/brand-react

## Overview

Private package (`"private": true`, `"sideEffects": false`) that ships the conciv logo as React components. The Solid components and the static logo assets live in `@internal/brand`.

## Interface

- [src/README.md](./src/README.md): `ConcivLockup` and `ConcivMark`.
- `exports["."]` (`package.json`): `import` from `./dist/conciv-lockup.js` (`vite build`), `types` from `./src/conciv-lockup.tsx`.
- Peer dependency `react` ^19; runtime dep `motion`.
- Scripts: `build`, `typecheck`.

## Invariants

- The bundle carries the `'use client';` banner and keeps `react` and `motion*` external (`vite.config.ts` `banner` / `external`).
- `vite build` writes the JavaScript and the declarations (`rolldown-plugin-dts`, from `tsconfig.build.json`).

## Side Effects

- `build` wipes and rewrites `dist/`.

## Verification

- Typecheck: `pnpm exec turbo run typecheck --filter=@internal/brand-react` from the repo root (the package has no tests yet)
