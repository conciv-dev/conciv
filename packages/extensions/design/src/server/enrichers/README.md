# design/src/server/enrichers

## Overview

colorEnricher applies only to target nodes that have no `fills`. It crops the node's box from the raster, computes a Sobel edge map, and takes the median non-edge color as the background and the median edge color as the foreground, with a fixed confidence of 0.8.

## Interface

- `colorEnricher` (`color.ts`): Enricher named 'color' with `applies(node)` and `run({node, raster})` returning {fills: {background, foreground}, confidence: 0.8}

## Invariants

- Runs only when `node.fills === undefined` (`colorEnricher`, `color.ts`)

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
