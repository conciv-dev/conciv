# design/src/server

## Overview

This directory stores design targets on disk, one directory per target id, each with target.png, model.json and record.json. It also keeps run artifacts (live, diff and result files) and captures. It provides PNG decode/encode and pixel operations (crop, blur, scaling, Sobel edge map, median colors, flood-fill regions) that the subdirectories use. It wires the concrete registries into a runtime chosen by DesignConfig, and it serves the x-ray page and target files over Hono plus an oRPC router.

## Interface

- `REGISTRIES` (`registries.ts`): Registries object that combines adapters, enrichers, captures, pixel, geometry, color, matchers, deltaKinds and mappers
- `pickRuntime` (`registries.ts`): builds a DesignRuntime (without store/cssMap/xrayUrl), selecting capture, pixel/geometry/color comparators and matcher by keys from DesignConfig (`capture`, `comparator`, `geometry`, `color`, `matcher`); text comparator is null
- `createTargetStore` (`store.ts`): returns a TargetStore with list, remove, put, find, model, writeCapture, writeRun, lastResult, reportPath
- `TARGET_FILE` (`store.ts`): constant 'target.png'
- `makeXrayRouter` (`xray-routes.ts`): oRPC router with procedures `xray.targets` (input {route?}) and `xray.report` (input {id}) returning target, last report and target image path
- `XrayRouter` (`xray-routes.ts`): type of the router returned by makeXrayRouter
- `makeXrayApp` (`xray-routes.ts`): Hono app with routes `GET /xray`, `GET /xray/:asset{.+}`, `GET /files/:file{.+}`
- `DELTA_KINDS` (`deltas.ts`): ordered list of 15 DeltaKind measurers (insets, gaps, fill, align, padding, typography, background, foreground, radius)
- `sideFrom` (`deltas.ts`): builds a Side (box, parent, prev/next neighbour, axis, textBox, styles) from a Pair for 'live' or 'target'
- `withBreakpoints` (`breakpoints.ts`): marks deltas `breakpoint: true` when no other width's last result for the same route has the same `kind selector` key
- `unmatchedRegions` (`unmatched.ts`): returns 'missing' target edge regions outside matched boxes and 'extra' live pairs that are blank in target but not in live
- `decodePng`/`encodePng` (`raster.ts`): convert between PNG bytes and Raster using pngjs
- `crop`, `boxBlur`, `scaleToWidth` (`raster.ts`): raster crop with margin and clamping, separable box blur, nearest-neighbour scale to width
- `edgeMap`, `edgeDensity` (`raster.ts`): Sobel edge mask (threshold 48) and fraction of edge pixels
- `medianColor`, `foregroundColor` (`raster.ts`): per-channel median hex color with an exclusion mask; foreground is the median over edge pixels
- `findRegions`, `diffMask` (`raster.ts`): flood-fill connected regions of at least minSize; mask of pure-red opaque diff output pixels
- Subdirectories:
  - [captures](./captures/README.md): Contains the 'tab' Capture, which asks the connected browser page to screenshot itself at a given size and returns a decoded raster plus the live component tree.
  - [enrichers](./enrichers/README.md): Contains the color Enricher, which fills in missing target node fills by sampling the target raster.
  - [registries](./registries/README.md): One-line modules that export the concrete implementations for each registry slot used by REGISTRIES in ../registries.ts.
  - [comparators](./comparators/README.md): Holds the pixel comparators (blazediff, pixelmatch), the CIEDE2000 color metric and the edge-projection geometry estimator.
  - [adapters](./adapters/README.md): Contains the image TargetAdapter, which loads a PNG from a file path or base64 string into a TargetModel scaled to a requested width.
  - [deltas](./deltas/README.md): Defines the DeltaKind measurers that compare live and target Sides for insets, gaps, fill, alignment, padding, typography, colors and radius.
  - [provenance](./provenance/README.md): Maps a winning CSS declaration for a live component back to its source location via inline style/sx, library theme overrides, className tokens, a parsed CSS map, emotion or styled.
  - [matchers](./matchers/README.md): Contains the 'tile' Matcher, which pairs live components with target boxes by comparing blurred tiles and descends into children only when a parent matches geometrically.

## Invariants

- `put` calls are serialized through a promise queue, so a later put waits for the previous one even if it failed (`createTargetStore`, `store.ts`)
- `put` deletes existing records with the same route and width before writing the new target, so there is one target per route and width (`createTargetStore`, `store.ts`)
- `remove` returns 0 and deletes nothing when neither id nor route is given (`createTargetStore`, `store.ts`)
- `model` throws `toolError('no-target')` when model.json is missing or fails ModelSchema (`createTargetStore`, `store.ts`)
- JSON files are validated with zod (RecordSchema, ModelSchema, DiffReportSchema), and invalid or unparseable files are treated as absent (`createTargetStore`, `store.ts`)
- Captures and live-/diff-/result- files are pruned to the newest `TOLERANCES.runsKept` per prefix (`createTargetStore`, `store.ts`)
- `writeRun` writes pending-_.json and then renames it to result-_.json, so results appear atomically (`createTargetStore`, `store.ts`)
- `list` returns records sorted by createdAt ascending, and `find` returns the last match (`createTargetStore`, `store.ts`)
- `xray.report` throws ORPCError NOT_FOUND for an unknown target id (`makeXrayRouter`, `xray-routes.ts`)
- `GET /xray` returns 404 unless the `target` query is non-empty and exists in the store, and 503 if index.html is not built (`makeXrayApp`, `xray-routes.ts`)
- `GET /xray/:asset` and `GET /files/:file` reject paths that resolve outside pageDir or designDir with a 404 (path traversal guard, `makeXrayApp`, `xray-routes.ts`)
- `withBreakpoints` returns the result unchanged when no sibling width has a last result (`withBreakpoints`, `breakpoints.ts`)
- Unmatched regions require both w and h >= `TOLERANCES.unmatchedMinimum`; an extra counts only when the target is blank (edge density < 0.01), the live raster is not, and its parent is not already an extra (`unmatchedRegions`, `unmatched.ts`)
- `sideFrom` returns null when the pair has no box on that side, and textBox is null if any child lacks a targetBox (`sideFrom`, `deltas.ts`)
- Live-side background is used only when it is an opaque 7-char hex; target-side styles come from sampled raster fills (`sideFrom`, `deltas.ts`)
- `boxBlur` is a no-op for radius <= 0, and `scaleToWidth` returns the input when the widths are equal (`raster.ts`)

## Side Effects

- Reads and writes the target store directory: mkdir, writeFile of target.png/model.json/record.json, rm of stale targets (`createTargetStore`, `store.ts`)
- Writes captures/capture-*.png and live-/diff-/pending-/result- files and deletes old ones during pruning (`createTargetStore`, `store.ts`)
- In-memory promise queue serializes put calls (`createTargetStore`, `store.ts`)
- Serves HTTP responses read from disk (index.html cached in memory after first read, assets, design files) (`makeXrayApp`, `xray-routes.ts`)
- Reads stored records and results through the TargetStore (`withBreakpoints`, `breakpoints.ts`)

## Verification

- Run: `cd packages/extensions/design && pnpm typecheck && pnpm lint` (the package has no `test` script)
