# @conciv/db

## Overview

Persistence package for conciv, internal to `@conciv/it`. It defines the drizzle SQLite schema, opens the database on `node:sqlite` with bundled migrations, and exposes typed queries. Built with tsdown to `dist/` as ESM.

## Interface

- `package.json:exports["."]` - `./dist/index.js` with types `./dist/index.d.ts`; source entry `src/index.ts` (`tsdown.config.ts:entry`).
- `package.json:scripts` - `build` (`tsdown`), `typecheck`, `gen-migrations`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw`.
- `drizzle.config.ts` - dialect `sqlite`, schema files `src/schema.ts` and `src/run-schema.ts`, migrations out to `./drizzle`.
- `drizzle-home.config.ts` - the per-user home db: schema `src/home-schema.ts`, migrations out to `./drizzle-home` (`pnpm --filter @conciv/db exec drizzle-kit generate --config drizzle-home.config.ts`).
- Subdirectories: [src](./src/README.md) - schema, `openDb` and queries; [src/scripts](./src/scripts/README.md) - migration bundling.

## Invariants

- `package.json:engines.node` is `>=26.0.0`.
- `turbo.json` makes `build` and `typecheck` depend on `gen-migrations`, so `src/migrations.gen.ts` (from `drizzle/`) and `src/home-migrations.gen.ts` (from `drizzle-home/`) are regenerated before compiling.
- The home schema only ever adds tables or nullable columns; a breaking change gets a new table name. Nothing in the home db is ever deleted: rows that stop being true get `deletedAt`.
- Schema changes go through `drizzle-kit` against `drizzle.config.ts`, then `gen-migrations`; `openDb` only applies the bundled `migrations` array.

## Side Effects

- See [src](./src/README.md): `openDb` creates and migrates `conciv.db` under `concivStateDir(stateRoot)`.
- `openHomeDb` creates the home folder (`0700`) and `home.db` (`0600`); see [src](./src/README.md).
- `src/scripts/gen-migrations.ts` overwrites `src/migrations.gen.ts` and `src/home-migrations.gen.ts`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/db` from the repo root (turbo builds the package and its dependencies first)
