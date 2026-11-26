# @conciv/home

## Overview

The per-user conciv home registry, internal to `@conciv/it`: `home.db` on `node:sqlite` holds the running engines and the hub connections every engine and the CLI share. Built with tsdown to `dist/` as ESM.

## Interface

- `.` (`src/home.ts`) is the home db and its queries. The migration lock `home.db` opens under is `@conciv/types/migration-lock`, shared with the engine's `conciv.db` (`@conciv/backend-defaults`).
- `drizzle.config.ts` - schema `src/registry/home-schema.ts`, migrations out to `./drizzle` (`pnpm --filter @conciv/home exec drizzle-kit generate`).
- Subdirectories: [src](./src/README.md).

## Invariants

- `package.json:engines.node` is `>=26.0.0`.
- `turbo.json` makes `build` and `typecheck` depend on `gen-migrations`, so `src/registry/home-migrations.gen.ts` (from `drizzle/`) is regenerated before compiling.
- The home schema only ever adds tables or nullable columns; a breaking change gets a new table name. Nothing in the home db is ever deleted: rows that stop being true get `deletedAt`.

## Side Effects

- `prepareHome` creates the home folder (`0700`), `home.db` and `home.lock` (`0600`); see [src](./src/README.md).
- `src/scripts/gen-migrations.ts` overwrites `src/registry/home-migrations.gen.ts`.
