# design/src/server/matchers

## Overview

tileMatcher crops both rasters to their common page area, blurs them, and computes a whole-page pixel mismatch. It then walks the live component tree level by level. A component whose blurred tile is under the tile gate keeps its live box as the target box; otherwise the geometry estimator searches inside the parent's target window. Each pair gets a CSS selector built from data-conciv-source and prev/next sibling links.

## Interface

- `tileMatcher` (`tile.ts`): Matcher named 'tile' whose `match({live, target, comparators, depth})` returns {mismatch, mask, pairs, matchedTargetBoxes}
- `expand` (`tile.ts`): grows a Box by `by` on every side (also used by unmatched.ts)
- `componentSelector` (`tile.ts`): builds `[data-conciv-source="file:line:col"]` (with `:nth-child(index)` when the source key repeats among siblings), or a tag path when there is no source

## Invariants

- Components whose box clipped to the page has w or h <= 0 are dropped (`tileMatcher`, `tile.ts`)
- A tile with mismatch < `TOLERANCES.tileGate` is treated as equal, so targetBox = liveBox (`tileMatcher`, `tile.ts`)
- It descends into children only if depth < maxDepth, mismatch >= tileGate, targetBox is non-null, live and target boxes agree within `TOLERANCES.geometryPx` on all edges, and the declared opaque background is within `TOLERANCES.declaredColorDeltaE` of the sampled target background (`tileMatcher`, `tile.ts`)
- Rasters are blurred with `TOLERANCES.blurRadius`, and tiles are expanded by `TOLERANCES.tileMargin` (`tileMatcher`, `tile.ts`)

## Side Effects

- None

## Verification

- Run: `cd packages/extensions/design && pnpm typecheck && pnpm lint` (the package has no `test` script)
