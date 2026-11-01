# app

## Overview

Next.js App Router root layout and home page from the create-next-app template.

## Interface

- `RootLayout` (`layout.tsx`): default export, the `<html>`/`<body>` shell with Geist font variables
- `metadata` (`layout.tsx`): Next.js page metadata (title, description)
- `Home` (`page.tsx`): default export, the `/` page

## Invariants

- None

## Side Effects

- `Geist`, `Geist_Mono` (`layout.tsx`): `next/font/google` downloads and self-hosts the fonts at build time

## Verification

- Run: `cd apps/examples/nextjs-app && pnpm lint && pnpm build` (the package has no `test` or `typecheck` script)
