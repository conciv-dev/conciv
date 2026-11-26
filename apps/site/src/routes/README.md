# routes

## Overview

Top-level file routes of the site: root document, landing, brand page, and server routes for `llms.txt`, sitemap, default OG image and pairing instructions.

## Subdirectories & Boundaries

- [api](./api/README.md), [docs](./docs/README.md), [og](./og/README.md)

## Invariants

- `__root.tsx`: search params are validated by `rootSearchSchema`; invalid values become `undefined`

## Side Effects

- `__root.tsx`: `LiveWidgetMount` mounts the live conciv widget in the browser
- `og[.]png.ts`: loads fonts through the `ASSETS` binding

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
