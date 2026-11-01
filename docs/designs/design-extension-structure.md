# Design extension: module structure

- **Author:** Omri Katz (omridevk)
- **Status:** Proposed
- **Date:** 2026-11-02

## The problem

`packages/extensions/design/src` holds 104 files, 317 exported symbols and 7,374 lines. The split is one file per implementation (11 registry files of 4 lines, 8 delta-kind files, 8 provenance mappers, 6 comparators) so every helper is exported for a sibling and nothing is private. The driver design copied the pattern and would add about 15 more files.

## The rule

1. A **slot** is one interface in `shared/types.ts` (the strategy). Every implementation of a slot lives in **one file**, as a module-private function or object, and that file exports **one table** of implementations keyed by name.
2. `server/runtime.ts` exports `pickRuntime(config)`: it reads `designConfig`, selects from each table, and returns the `DesignRuntime`. It is the only place that knows every slot.
3. A file exports what another file imports and nothing else. Helpers shared by two slot files move to `raster.ts` (pixels) or `shared/` (types, schemas, constants).
4. No `registries/`, no per-kind folders, no README per folder inside `src` (the package README describes the tree).

## Target tree

```text
src/
  client.ts            widget entry: components, capture, winner (today client/*, 5 files)
  server.ts            extension entry; pickRuntime and the slot tables live here (replaces registries.ts + registries/*)
  shared/
    defs.ts            tool defs and wire schemas (unchanged)
    types.ts           domain types and the slot interfaces
    tolerances.ts      constants and designConfig (absorbs config.ts, messages.ts, source-attr.ts, properties.ts, above.ts)
  server/
    target.ts          TargetAdapter, TextReader, Enricher, Segmenter, RoleRules implementations and the
                       registration pipeline (today adapters/, enrichers/, comparators/paddle, tool/steps/target)
    deltas.ts          every DeltaKind, private per kind; exports DELTA_KINDS and sideFrom
    provenance.ts      every ProvenanceMapper, css-map, jsx reading; exports MAPPERS and mapDeclaration
    raster.ts          pure pixel operations (unchanged)
    store.ts           TargetStore (unchanged)
    differ.ts          createDiffer: pixel comparators, tile/unmatched/text-group matching, the register,
                       run, status, clear, capture, winner steps and the tool bindings (today differ.ts,
                       comparators/*, matchers/, unmatched.ts, text-groups.ts, tool/*)
    xray-routes.ts     HTTP routes for the x-ray (unchanged)
  xray/
    entry.tsx          mount
    router.tsx         routes, search schema, data loading (today router, routes/*, data.ts, xray-schemas.ts)
    panel.tsx          panel, rows, detail, fix prompt
    stage.tsx          canvas and stage toolbar
    states.tsx         loading, empty and error states, shortcuts
```

17 files. `dev-fixture.ts` moves under `test/` as a fixture. Driver additions land inside these files: pairing and ranking in one new `server/pair.ts`, stage/score/stop and runs in one new `server/loop.ts`, the mirror and the type estimate in `client.ts` or one `client/mirror.ts` if `client.ts` passes 600 lines. Two or three files, not twelve.

A file stays under about 800 lines; `differ.ts` is the one allowed to approach it.

## Strategy shape

```ts
// shared/types.ts
export type Segmenter = {name: string; segment(input: {raster: Raster; nodes: TargetNode[]}): Promise<TargetNode[]>}

// server/target.ts
function thresholdSegmenter(): Segmenter { … }     // private
export const SEGMENTERS = {threshold: thresholdSegmenter()} as const satisfies Record<string, Segmenter>

// server.ts
export function pickRuntime(config: DesignConfig): DesignRuntime {
  return {segmenters: [SEGMENTERS[config.segmenter]], …}
}
```

Adding an implementation is a private function and one table entry. Nothing else changes.

## Execution

One step on `design-driver`, before driver step 3, behavior unchanged: `git mv` and fold, delete the 16 `src/**/README.md`, rewrite the package README tree, run fallow for dead exports, keep the design IT at its current count. The driver design's slot table and items 20, 24 to 27, 30 to 33 then point at the files above; items that named a file per implementation name a private function in the slot file instead.
