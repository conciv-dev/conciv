# design/src/tool/steps

## Overview

Each file exports one ServerStep that receives (input, ctx, request, page) and works through ctx.design and page.call. targetStep loads a design image through a matching adapter, runs the enrichers on it and stores it as a target record for a route and width. diffStep captures the live page, matches it against the stored target, ranks the components that differ, adds style provenance by calling design_winner in the page plus mapDeclaration, and writes the run. statusStep, captureStep, clearStep and winnerStep cover reporting, raw capture, removal and the CSS winner lookup.

## Interface

- `targetStep` (`target.ts`): handler for design_target; resolves width (input or probe), route (input or live page_route), adapter, enrichers, then `design.store.put`; returns id/route/width/height/scale
- `liveRoute` (`target.ts`): calls page tool `page_route` and returns `pathname+search`
- `targetWidth` (`target.ts`): returns input width, or the probed viewport width via `page.call(captureDef.name, {probe: true})`
- `diffStep` (`diff.ts`): handler for design_diff; finds the target, captures live, matches, ranks components, attributes provenance, writes the run and returns a DiffReport with xray url, mismatch, components and unmatched regions
- `statusStep` (`status.ts`): handler for design_status; lists targets for a route and gives each its last mismatch, above-tolerance count and run time, plus a `done` flag
- `captureStep` (`capture.ts`): handler for design_capture; passes probe/clear requests to the page, otherwise captures the live route, writes a PNG via `design.store.writeCapture` and returns path/size/route/components
- `clearStep` (`clear.ts`): handler for design_clear; removes targets by id and/or route, clears the capture frame, returns `{removed}`
- `winnerStep` (`winner.ts`): handler for design_winner; passes the input to the page's design_winner and validates the result with `WinnerResultSchema`

## Invariants

- `diffStep` (`diff.ts`) throws toolError 'no-target' if `input.target` matches no stored id, or if no record exists for the live route (then its pathname without the query) at the resolved width
- `diffStep` (`diff.ts`) throws toolError 'route-mismatch' when the tab's live route (query string dropped unless the record route has one) differs from the target record's route
- `diffStep` (`diff.ts`) only reports pairs with `mismatch >= TOLERANCES.tileGate` and drops a component that has no deltas but has reported children
- `diffStep` (`diff.ts`) sorts components with deltas first, then by mismatch times live box area, keeps the first `input.limit` (DiffInputSchema bounds limit to 1-50) and rounds mismatch to 4 decimals (`MISMATCH_PRECISION` 10_000)
- `diffStep` (`diff.ts`) skips provenance for winners that are null, undefined or `inherited`; properties in `PARENT_PROPERTIES` are looked up on the parent pair
- `diffStep` (`diff.ts`) adds a `hint` when no live component carries data-conciv-source or when the xray url is not absolute
- `targetStep` (`target.ts`) throws toolError 'image-unreadable' when no `design.adapters` entry accepts the image ref
- `statusStep` (`status.ts`): `done` is true only when there is at least one target and every target has a run (`lastAt !== null`) with `above === 0`
- `captureStep` (`capture.ts`) and `targetStep` (`target.ts`) check page responses with zod (`ViewportResultSchema`, and `PageRouteSchema` for pathname/search)
- `statusStep` (`status.ts`) falls back to the pathname without the query when no records exist for the full live route

## Side Effects

- Calls page tools through `page.call` ('page_route', design_capture, design_winner) in `liveRoute`/`targetWidth` (`target.ts`), `captureStep` (`capture.ts`), `diffStep` (`diff.ts`) and `winnerStep` (`winner.ts`)
- Writes a stored target via `design.store.put` in `targetStep` (`target.ts`)
- Writes a capture PNG via `design.store.writeCapture` in `captureStep` (`capture.ts`)
- Writes the live raster, the painted diff raster and the result via `design.store.writeRun` in `diffStep` (`diff.ts`)
- Deletes targets via `design.store.remove` and clears the page capture frame via `design.capture.clear` in `clearStep` (`clear.ts`)
- Reads the CSS map and source files (through `mapDeclaration` with `design.cwd`) in `diffStep` (`diff.ts`)

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
