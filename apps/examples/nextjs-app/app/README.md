# app

## Overview

Next.js App Router root layout and home page from the create-next-app template.

## Invariants

- None

## Side Effects

- `Geist`, `Geist_Mono` (`layout.tsx`): `next/font/google` downloads and self-hosts the fonts at build time

## Verification

- Run: `pnpm exec turbo run build --filter=nextjs-app` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` or `typecheck` script)
