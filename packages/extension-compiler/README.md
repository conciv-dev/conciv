# @conciv/extension-compiler

## Overview

Vite build plumbing for conciv extension code: client/server splitting, Solid TSX compilation, JSX source stamping and the `virtual:conciv-extensions` module. `package.json` describes it as internal to `@conciv/it`. ESM, no bin entries.

## Interface

- [src/README.md](./src/README.md): split, compile, source stamping, virtual module and server-side loading.
- Test fixtures: `test/fixtures/iso-extensions/` (an extension whose `.client()` throws on the server) and `test/fixtures/nested-extensions/` (a tool imported from a sibling file), both passed to `loadServerExtensions` by `test/extension-compiler.it.test.ts`.
- Exports (`package.json`): `./vite-plumbing`, `./extensions`, `./inject-source`, `./compile-extension`, `./split-extension`, `./dedupe` (-> `dist/dedupe-extensions.js`).
- `src/extension-guard.ts` is a tsdown entry (`tsdown.config.ts`) with no `exports` subpath; it is imported only by `dedupe-extensions.ts`.
- Peer dependency `solid-js` ^1.9.13; runtime deps include `@babel/core`, `babel-preset-solid`, `@babel/preset-typescript`, `babel-dead-code-elimination`, `jiti`, `magic-string`, `oxc-parser`, `@conciv/extension`, `@conciv/protocol`.
- Scripts: `build` (`tsdown`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw`.

## Invariants

- `vite` stays external to the build (`external: ['vite']`, `tsdown.config.ts`).
- Vitest runs only `test/**/*.it.test.ts` and excludes `test/fixtures/**` (`vitest.config.ts`).
- `tsconfig.json` type-checks `src/**/*.ts` and `test/**/*.ts` with `lib: ["ES2024"]`, `types: ["node"]`.

## Side Effects

- `build` writes `dist/`. Runtime effects are listed in [src/README.md](./src/README.md).

## Verification

- Run: `cd packages/extension-compiler && pnpm test`
- Also: `pnpm typecheck`, `pnpm lint`
