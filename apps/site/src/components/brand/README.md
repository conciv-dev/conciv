# brand

## Overview

The `/brand` page: logo picker by layout, format and tone, previews, and copy and download actions for brand assets.

## Interface

- `BrandPage` (`brand-page.tsx`): the brand assets page
- `LogoPicker` (`logo-picker.tsx`): layout (default `landscape`), format (default `svg`) and tone (default `crimson-on-light`) selection
- `CopySvgButton({path})`, `DownloadButton({path, label, accessibleName})` (`brand-actions.tsx`)
- `BrandBackdrop`, `BrandImage` (`brand-preview.tsx`)

## Invariants

- `brand-actions.tsx:CopySvgButton`: the copied state resets after `RESET_DELAY`

## Side Effects

- `brand-actions.tsx`: `fetch(brandAssetUrl(path))` and `navigator.clipboard.writeText` to copy an SVG
- `brand-actions.tsx:CopySvgButton`: `setTimeout` to revert the button label

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
