# og

## Overview

Per-docs-page Open Graph image route.

## Interface

- `/og/{$}.png` (`{$}[.]png.ts`): GET renders the OG PNG for a docs page with `renderOgImageResponse`

## Invariants

- `{$}[.]png.ts`: an unknown page returns `404 Not found`
- `{$}[.]png.ts`: responses carry `OG_IMAGE_CACHE_HEADERS`

## Side Effects

- `{$}[.]png.ts`: loads fonts through the Worker `ASSETS` binding (`loadOgFonts`)

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
