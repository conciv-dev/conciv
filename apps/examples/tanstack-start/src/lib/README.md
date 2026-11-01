# lib

## Overview

Small helpers for the TanStack Start example.

## Interface

- `cn(...parts)` (`cn.ts`): joins truthy class names
- `NAV_LINKS` (`nav.ts`): `/`, `/about`, `/form` link list
- `activeLink(pathname)` (`nav.ts`): returns the matching `NavLink` or `null`
- `NavLink` (`nav.ts`): `{to, label}` type

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=tanstack-start-example` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
