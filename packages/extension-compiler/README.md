# @conciv/extension-compiler

## Overview

Vite build plumbing for conciv extension code: client/server splitting, Solid TSX compilation, JSX source stamping and the `virtual:conciv-extensions` module. `package.json` describes it as internal to `@conciv/it`. ESM, no bin entries.

## Interface

- [src/README.md](./src/README.md): split, compile, source stamping, and the virtual module.
- Exports (`package.json`): `./vite-plumbing`, `./extensions`, `./compile-extension`, `./split-extension`.
- Peer dependency `solid-js` ^1.9.13; runtime deps include `@babel/core`, `babel-preset-solid`, `@babel/preset-typescript`, `babel-dead-code-elimination`, `@conciv/protocol`.
- Scripts: `build` (`tsdown`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw`.

## Invariants

- `vite` stays external to the build (`external: ['vite']`, `tsdown.config.ts`).
- Vitest runs only `test/**/*.it.test.ts` and excludes `test/fixtures/**` (`vitest.config.ts`).
- `tsconfig.json` type-checks `src/**/*.ts` and `test/**/*.ts` with `lib: ["ES2024"]`, `types: ["node"]`.

## Side Effects

- `build` writes `dist/`. Runtime effects are listed in [src/README.md](./src/README.md).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-compiler` from the repo root (turbo builds the package and its dependencies first)
- Also: `pnpm typecheck`, `pnpm lint`
