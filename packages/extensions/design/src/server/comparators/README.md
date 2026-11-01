# design/src/server/comparators

## Overview

The two pixel comparators run a diff with shared options and turn the red diff output into a mismatch ratio, a mask and changed regions. ciede2000 computes the perceptual distance between two CSS color strings using culori. edgeProjection estimates where a live component's box sits in the target raster by projecting Sobel edges onto columns and rows.

## Interface

- `blazediffComparator` (`blazediff.ts`): PixelComparator 'blazediff' using @blazediff/core `diff`
- `DIFF_OPTIONS` (`blazediff.ts`): {threshold: 0.1, includeAA: false, diffMask: true}
- `pixelResult` (`blazediff.ts`): converts diff output and count into {mismatch, mask, regions(kind 'changed')}
- `pixelmatchComparator` (`pixelmatch.ts`): PixelComparator 'pixelmatch' using the same DIFF_OPTIONS and pixelResult
- `ciede2000` (`ciede2000.ts`): ColorMetric 'ciede2000' whose `distance({a,b})` is the CIEDE2000 difference
- `edgeProjection` (`edge-projection.ts`): GeometryEstimator 'edge-projection' whose `estimate({target, liveBox})` returns {targetBox}

## Invariants

- mismatch is 0 when the image area is 0 (`pixelResult`, `blazediff.ts`)
- Unparseable colors give a distance of 0 (`ciede2000`, `ciede2000.ts`)
- estimate returns targetBox null when the tile is out of bounds, tile edge density < 0.01, no edge run overlaps the live span by >= 50%, the column span is too narrow after 2px edge trimming, or the result has w/h <= 0 (`edgeProjection`, `edge-projection.ts`)
- The tile around the live box is expanded by `TOLERANCES.tileMargin` (`edgeProjection`, `edge-projection.ts`)

## Side Effects

- None

## Verification

- Run: `cd packages/extensions/design && pnpm typecheck && pnpm lint` (the package has no `test` script)
