# design/src/server/registries

## Overview

Each file imports the concrete implementation(s) from a sibling server directory and exports them typed as the matching Registries entry or array. Keyed registries (captures, pixel, geometry, color, matchers) are looked up by config value in pickRuntime. List registries (adapters, enrichers, deltaKinds, mappers) are passed through whole.

## Interface

- `adapters` (`adapters.ts`): [imageAdapter]
- `captures` (`captures.ts`): {tab: tabCapture}
- `color` (`color.ts`): {ciede2000}
- `deltaKinds` (`delta-kinds.ts`): DELTA_KINDS from ../deltas.ts
- `enrichers` (`enrichers.ts`): [colorEnricher]
- `geometry` (`geometry.ts`): {'edge-projection': edgeProjection}
- `mappers` (`mappers.ts`): MAPPERS from ../provenance/mappers.ts
- `matchers` (`matchers.ts`): {tile: tileMatcher}
- `pixel` (`pixel.ts`): {blazediff: blazediffComparator, pixelmatch: pixelmatchComparator}

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
