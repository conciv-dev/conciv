# design/src/server/deltas

## Overview

Each module exports DeltaKind objects whose `measure({live, target, color})` returns zero or one delta records (two for padding, one per axis). Geometry deltas are derived from the gap between box and textBox, from sibling gaps, or from width relative to the parent. Typography, radius and color deltas compare style values against fixed tolerances or TOLERANCES values.

## Interface

- `insetLeft`, `insetRight`, `insetTop`, `insetBottom` (`insets.ts`): DeltaKinds 'inset-*' that compare textBox-to-box insets
- `measureInsets`, `differs`, `right`, `bottom`, `Insets` (`insets.ts`): inset computation, a `> TOLERANCES.geometryPx` difference check, and box edge helpers
- `gapBefore`, `gapAfter` (`gaps.ts`): DeltaKinds 'gap-before'/'gap-after' measuring the gap to the prev/next sibling along the axis
- `fill` (`fill-align.ts`): DeltaKind for the box/parent width ratio, rounded to 3 decimals
- `align` (`fill-align.ts`): DeltaKind that classifies stretch/center/left/right from insets
- `padding` (`padding.ts`): DeltaKind emitting x and y padding deltas from averaged insets
- `radius` (`radius.ts`): DeltaKind comparing `styles.radius`
- `fontSize`, `lineHeight`, `fontWeight` (`typography.ts`): numeric style DeltaKinds
- `background`, `foreground` (`colors.ts`): color DeltaKinds that use the ColorMetric distance
- `isOpaqueHex`, `sampledFills` (`colors.ts`): checks for a 7-char '#' hex; samples median background and foreground from a cropped raster

## Invariants

- Inset, gap, padding and radius deltas are emitted only when |live - target| > `TOLERANCES.geometryPx` (`differs`, `insets.ts`)
- Inset measurements are null when textBox is null (`measureInsets`, `insets.ts`)
- Gaps are null when the axis or the neighbour is null (`gapBefore`, `gaps.ts`)
- fill is null when the parent is null or the parent width <= 0, and it is suppressed when |a-b| <= `TOLERANCES.fillDifference * max(a,b)` (`fill`, `fill-align.ts`)
- align uses `TOLERANCES.geometryPx` as the near-zero threshold and emits nothing if either side is unclassified or both classes are equal (`align`, `fill-align.ts`)
- padding is measured only when `styles.fontSize` is defined (`padding`, `padding.ts`)
- fontSize/lineHeight tolerance is 0.5, fontWeight tolerance is 0, and non-number values are skipped (`typographyKind`, `typography.ts`)
- background uses tolerance `TOLERANCES.declaredColorDeltaE` and foreground uses `TOLERANCES.colorDeltaE`; undefined values are skipped (`background`/`foreground`, `colors.ts`)

## Side Effects

- None

## Verification

- Run: `cd packages/extensions/design && pnpm typecheck && pnpm lint` (the package has no `test` script)
