# brand

## Overview

The `/brand` page: logo picker by layout, format and tone, previews, and copy and download actions for brand assets.

## Invariants

- `brand-actions.tsx:CopySvgButton`: the copied state resets after `RESET_DELAY`

## Side Effects

- `brand-actions.tsx`: `fetch(brandAssetUrl(path))` and `navigator.clipboard.writeText` to copy an SVG
- `brand-actions.tsx:CopySvgButton`: `setTimeout` to revert the button label

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
