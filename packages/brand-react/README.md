# @conciv/brand-react

## Overview

Private package (`"private": true`, `"sideEffects": false`) that ships the conciv logo as React components. The Solid components and the static logo assets live in `@conciv/brand`.

## Interface

- [src/README.md](./src/README.md): `ConcivLockup` and `ConcivMark`.
- `exports["."]` (`package.json`): `./dist/conciv-lockup.js` (tsdown) + `./dist/conciv-lockup.d.ts` (tsc, `tsconfig.build.json`).
- Peer dependency `react` ^19; runtime dep `motion`.
- Scripts: `build`, `typecheck`, `lint` (`oxlint`).

## Invariants

- The bundle carries the `'use client';` banner and keeps `react` and `motion*` external (`tsdown.config.ts` `banner` / `external`).
- Build order is fixed by the `build` script: tsdown first, then tsc with `emitDeclarationOnly` (`tsconfig.build.json`).

## Side Effects

- `build` wipes and rewrites `dist/` (tsdown, then tsc).

## Verification
