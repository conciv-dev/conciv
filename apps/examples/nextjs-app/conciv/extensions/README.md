# extensions

## Overview

Conciv extension folder for the Next.js example; re-exports the TanStack extension.

## Interface

- `default` (`tanstack.tsx`): re-export of `@conciv/extension-tanstack`

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run lint build --filter=nextjs-app` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` or `typecheck` script)
