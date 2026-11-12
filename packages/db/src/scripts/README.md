# db scripts

## Overview

Holds `gen-migrations.ts`, the generator behind the `gen-migrations` script. It reads the drizzle-kit SQL migrations in `drizzle/` and writes them as a TypeScript module, so migrations ship inside the bundle.

## Interface

- `gen-migrations.ts` - run via `pnpm run gen-migrations` (`package.json:scripts.gen-migrations`, `node src/scripts/gen-migrations.ts`); emits `export const migrations: MigrationMeta[]` into `src/migrations.gen.ts` (from `drizzle/`) and `export const homeMigrations: MigrationMeta[]` into `src/home-migrations.gen.ts` (from `drizzle-home/`).

## Invariants

- `turbo.json:tasks.gen-migrations` declares inputs `drizzle/**`, `drizzle-home/**` and `src/scripts/gen-migrations.ts` and outputs `src/migrations.gen.ts` and `src/home-migrations.gen.ts`; `build` and `typecheck` depend on it, so both are regenerated after any change in `drizzle/` or `drizzle-home/`.

## Side Effects

- `gen-migrations.ts` reads `drizzle/` and `drizzle-home/` with `readMigrationFiles` from `drizzle-orm/migrator` and overwrites `src/migrations.gen.ts` and `src/home-migrations.gen.ts` with `writeFileSync`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/db` from the repo root (turbo builds the package and its dependencies first)
