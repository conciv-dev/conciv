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

- Run: `cd apps/examples/tanstack-start && pnpm typecheck && pnpm lint` (the package has no `test` script)
