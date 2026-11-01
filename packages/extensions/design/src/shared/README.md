# design/src/shared

## Overview

`defs.ts` defines the input and output schemas and uses `defineTool` to declare `design_target`, `design_diff`, `design_status`, `design_capture`, `design_winner` and `design_clear`, all sharing the `DESIGN_ERRORS` catalog. `config.ts` lists the selectable comparator, geometry, color, capture and matcher implementations. `types.ts` declares the plug-in contracts (adapters, enrichers, comparators, matcher, delta kinds, provenance mappers, target store) and `DesignRuntime`. `tolerances.ts`, `above.ts` and `properties.ts` hold numeric thresholds, the above-tolerance count and the physical/logical CSS side alias mapping.

## Interface

- `DESIGN_EXTENSION_NAME` = 'design', `DESIGN_TOOL_PREFIX` = 'design_' (`defs.ts`)
- `designVerb(name)` (`defs.ts`): removes the `design_` prefix
- tool `design_target` / `targetDef` (`defs.ts`): mutating; input `{image, route?, width?, name?}`, output `TargetResultSchema`
- tool `design_diff` / `diffDef` (`defs.ts`): input `{target?, width?, depth=3 (1-6), limit=12 (1-50)}`, output `DiffReportSchema`
- tool `design_status` / `statusDef` (`defs.ts`): input `{route?}`, output `StatusReportSchema` (with `done`)
- tool `design_capture` / `captureDef` (`defs.ts`): input `{width?, height?, probe?, clear?, timeout?}`, output capture or viewport
- tool `design_winner` / `winnerDef` (`defs.ts`): input `{selector, properties[], width?, height?}`, output a record of property to `Winner` or null
- tool `design_clear` / `clearDef` (`defs.ts`): mutating; input `{target?, route?}`, output `{removed}`
- `DESIGN_TOOL_DEFS` (`defs.ts`): tuple of the six tool defs
- `DESIGN_ERRORS` (`defs.ts`): `image-unreadable`, `width-required`, `no-target`, `frame-blocked`, `frame-timeout`, `route-mismatch`
- schemas `DeltaKindNameSchema`/`DELTA_KIND_NAMES` (15 kinds), `BoxSchema`, `SourceLocSchema`, `LiveComponentSchema`, `ProvenanceSchema`, `DeltaSchema`, `UnmatchedSchema`, `WinnerSchema`, `ComponentReportSchema`, `DiffReportSchema`, `StatusReportSchema`, `CaptureResultSchema`, `ViewportResultSchema`, `WinnerResultSchema`, `ClearResultSchema` and the `*InputSchema` schemas (`defs.ts`)
- `designConfig` / `DesignConfig` (`config.ts`): zod config with defaults comparator `blazediff` (or `pixelmatch`), geometry `edge-projection`, color `ciede2000`, capture `tab`, matcher `tile`
- `TOLERANCES` (`tolerances.ts`): geometryPx 2, colorDeltaE 3, declaredColorDeltaE 1, tileGate 0.005, unmatchedMinimum 24, tileMargin 8, interiorInset 4, blurRadius 1, fillDifference 0.05, depth 3, limit 12, runsKept 20, frameSettleMs 5000, captureBudgetMs 10000
- `LIBRARY_SHEET_MARKER` = '/node_modules/' (`tolerances.ts`)
- `CAPTURE_REQUEST` = 'conciv-design:capture', `CAPTURE_READY` = 'conciv-design:capture-ready' (`messages.ts`)
- `componentAboveTolerance` / `aboveTolerance` (`above.ts`): checks a single component / counts the components above tolerance plus the unmatched entries
- `propertyAliases(property)` / `declares({declared, property})` (`properties.ts`): map physical and logical sides for inset/padding/margin/border and match shorthands
- types `DesignRuntime`, `DesignContext`, `TargetStore`, `TargetRecord`, `TargetModel`, `TargetAdapter`, `Enricher`, `Capture`, `PixelComparator`, `GeometryEstimator`, `ColorMetric`, `Matcher`, `DeltaKind`, `ProvenanceMapper`, `CssMap`, `Registries`, `ServerStep`, `LiveComponent`, `Winner`, `Provenance` (`types.ts`)

## Invariants

- `designVerb` (`defs.ts`): throws `"<name>" is not a design tool` when the name lacks the `design_` prefix
- `Width` (`defs.ts`): every width/height input must be a positive integer
- `DiffInputSchema` (`defs.ts`): `depth` is an int from 1 to 6 (default 3), `limit` is an int from 1 to 50 (default 12)
- `CaptureInputSchema.timeout` (`defs.ts`): positive integer milliseconds
- `designTool` (`defs.ts`): every tool is named `design_<verb>` with meta `category: 'design'`, `mirrors: false`, `capture: 'none'`
- `componentAboveTolerance` (`above.ts`): a component is above tolerance if it has any delta or `mismatch >= TOLERANCES.tileGate` (0.005)
- `config.ts` enums only allow the listed implementations (`blazediff`/`pixelmatch`, `edge-projection`, `ciede2000`, `tab`, `tile`)

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
