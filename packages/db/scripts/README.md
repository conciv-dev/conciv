# db scripts

## Overview

Holds `gen-migrations.ts`, the generator behind the `gen-migrations` script. It reads the drizzle-kit SQL migrations in `drizzle/` and writes them as a TypeScript module, so migrations ship inside the bundle.

## Interface

- `gen-migrations.ts` - run via `pnpm run gen-migrations` (`package.json:scripts.gen-migrations`, `node scripts/gen-migrations.ts`); emits `export const migrations: MigrationMeta[]` into `src/migrations.gen.ts`.

## Invariants

- `turbo.json:tasks.gen-migrations` declares inputs `drizzle/**` and `scripts/gen-migrations.ts` and output `src/migrations.gen.ts`; `build` and `typecheck` depend on it, so `src/migrations.gen.ts` must be regenerated after any change in `drizzle/`.

## Side Effects

- `gen-migrations.ts` reads `drizzle/` with `readMigrationFiles` from `drizzle-orm/migrator` and overwrites `src/migrations.gen.ts` with `writeFileSync`.

## Verification

- Run: `cd packages/db && pnpm test`
