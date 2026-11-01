# @conciv/contract

## Overview

The oRPC contract (procedures plus zod schemas) shared by conciv core and its clients. `package.json` describes it as internal to `@conciv/it`; it is published with `publishConfig.access: public`. ESM only.

## Interface

- [src/README.md](./src/README.md): the `contract` router, row schemas, `makeRpcClient`, `makeBrowserRpcClient` and the shared browser transport.
- `exports["."]` (`package.json`): `./dist/index.js` + `./dist/index.d.ts`, built by tsdown from `src/index.ts` (`tsdown.config.ts`).
- Dependencies (`package.json`): `@conciv/protocol` (workspace), `@orpc/client`, `@orpc/contract`, `zod`.
- Scripts: `build` (`tsdown`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw` (`attw --pack . --profile esm-only`). `vitest.config.ts` spreads `ciTest()` from `@conciv/vitest-config`.

## Invariants

- ESM only: `"type": "module"`, tsdown `format: 'esm'`, attw `--profile esm-only` (`package.json`, `tsdown.config.ts`).
- `tsconfig.json` includes the `DOM` lib because `src` uses `fetch`, `location` and `Request`.

## Side Effects

- `build` writes `dist/` (`tsdown.config.ts`).

## Verification

- Run: `cd packages/contract && pnpm test`
- Also: `pnpm typecheck`, `pnpm lint`
