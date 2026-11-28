# routes

## Overview

File routes for the TanStack Start example: root document, home, about and a TanStack Form demo.

## Invariants

- `form.tsx:FormDemo`: field validators require a `role` (`Pick a role`) and accepted terms (`You must accept the terms`) before submit

## Side Effects

- `form.tsx:FormDemo`: `onSubmit` stores the submitted value in component state only; no network call

## Verification

- Run: `pnpm exec turbo run typecheck --filter=tanstack-start-example` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
