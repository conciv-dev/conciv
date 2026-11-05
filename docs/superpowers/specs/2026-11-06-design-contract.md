# Design extension: the contract

Supersedes the file layout in `2026-11-05-design-one-tree.md`; the data structure there stands. This document is the whole public surface of `packages/extensions/design/src`. Every file below exports exactly one symbol. A stage agent writes its file from this contract and the old file named as its reference, body by body, and never widens the contract: a need the contract does not cover is reported, not added.

## Why one method per stage

The previous attempt turned each old module's function list into an "interface" with twelve methods. That is the implementation's table of contents, not a boundary. A stage has one job and one method; its helpers are private. If a consumer wants a stage's helper, the stage's output was wrong.

## `shared/defs.ts`, the 21 exports

```ts
import type {Storage} from 'unstorage'
import type {ServerToolPageAccess} from '@conciv/extension'

// 1. tools
export const DESIGN_TOOLS: readonly AnyToolBuilder[]   // targetDef, diffDef, statusDef, watchDef, captureDef, measureDef, renderDef, winnerDef, clearDef, built here with their input and output schemas private

// 2. domain, all z.infer of a private schema except where noted
export type Box = {x: number; y: number; w: number; h: number}
export type Design = {id; source: {kind: 'image' | 'figma'; ref}; viewport: {width; height}; scale; root: DesignNode}
export type DesignNode = {id; box; hash; layout?: Partial<NodeLayout>; children: DesignNode[]} & (text | box | image kinds as today)
export type Run = {id; round; design; root: Match; extras: LiveComponent[]; score: number[]; stage: Stage | null; stop: Stop | null; images: {live; diff}; mismatch: number; similarity: number | null}
export type Match = {node: Omit<DesignNode, 'children'>; live: Omit<LiveComponent, 'children'> | null; hash; confidence; source; deltas: Delta[]; status; since; children: Match[]}
export type Delta = (as today)
export type Decision = {id; kind; anchor; value: string | number | Typography | null; at}
export type TargetRecord = (as today)
export type LiveComponent = (as today, recursive children)
export type Raster = {width; height; crop(input: {box: Box; margin?: number}): Raster; scaled(scale: number): Raster; rgb(index: number): Rgb; ink(box: Box): number; fills(input: {box: Box; glyphs: Box[]; color: string}): string[]; median(exclude: Box[]): Rgb; png(): Uint8Array; pixels(): Uint8Array}
export type DiffReport = (the wire schema as today; the tool output of design_diff)

// 3. schemas that validate stored data outside defs.ts
export const DesignSchema, RunSchema, DecisionSchema, TargetRecordSchema

// 4. stage interfaces, one method each (plus dispose where a resource is held)
export type TargetAdapter = {
  kind: string
  accepts(ref: string): boolean
  load(input: {ref: string; scale: number; project: Storage; files: Storage; attachments: {document?: unknown; image?: Uint8Array}}): Promise<{design: Design; image: Uint8Array; warnings: string[]}>
}

export type Store = {
  put(input: {design: Design; image: Uint8Array; session: string; route?: string; name?: string; framework?: 'react' | 'solid'}): Promise<TargetRecord>
  design(id: string): Promise<Design>
  image(input: {id: string; run?: string; kind?: 'live' | 'diff'}): Promise<Uint8Array | null>
  record(id: string): Promise<TargetRecord | null>
  current(session: string): Promise<TargetRecord | null>
  list(route?: string): Promise<TargetRecord[]>
  remove(input: {id?: string; all?: boolean}): Promise<number>
  runs(id: string): Promise<string[]>
  latest(id: string): Promise<Run | null>
  run(input: {id: string; run: string}): Promise<Run | null>
  writeRun(input: {run: Run; live: Uint8Array; diff: Uint8Array}): Promise<Run>
  decisions(id: string): Promise<Decision[]>
  decide(input: {id: string; kind: Decision['kind']; anchor: string; value: Decision['value']}): Promise<Decision>
  revoke(input: {id: string; decision: string}): Promise<boolean>
  accept(input: {id: string; run: string}): Promise<TargetRecord>
  writeCapture(png: Uint8Array): Promise<string>
  path(key: string): string | null
}

export type Measurer = {
  probe(page: ServerToolPageAccess): Promise<{route: string; framework: 'react' | 'solid'}>   // no screenshot; registration and the other-route refusal
  measure(input: {page: ServerToolPageAccess; width?: number; height?: number; timeout?: number}): Promise<Measured>
  dispose(): void
}
export type Measured = {live: LiveComponent; raster: Raster; route: string; framework: 'react' | 'solid'; masks: Box[]; limits?: DiffReport['limits']; path: 'region' | 'snapdom-live' | 'snapdom-mirror'; sources: ('dom' | 'mirror' | 'takumi')[]; confidence: number; longestTask?: number; pageError?: string}

export type Pairer = (input: {design: Design; measured: Measured; target: Raster; previous: Run | null; decisions: Decision[]; twins: {node: string; path: string; confidence: number}[]; edited: string[]; budget: number}) => Promise<{root: Match; partial: boolean; carried: number}>

export type Deltas = {
  compute(input: {root: Match; design: Design; measured: Measured; target: Raster; previous: Run | null; decisions: Decision[]; page: ServerToolPageAccess; project: Storage}): Promise<{root: Match; extras: LiveComponent[]; warnings: Delta[]; mismatch: number; similarity: number | null; diff: Raster}>
  dispose(): void
}

export type Judge = (input: {root: Match; extras: LiveComponent[]; warnings: Delta[]; previous: Run | null; rounds: Run[]; decisions: Decision[]; accepted: Set<string>; run: string; section?: string}) => {root: Match; score: number[]; stage: Stage | null; stop: Stop | null; items: Item[]}

export type Words = {
  outline(design: Design): string[]
  placeholder(framework: 'react' | 'solid'): string
  report(input: {run: Run; previous: Run | null; items: Item[]; measured: Measured; design: Design; record: TargetRecord; input: DiffInput; paths: {design: string; placeholder: string; live: string; diff: string; xray: string}; timings: DiffReport['timings']}): DiffReport
}

export type Runner = (input: {record: TargetRecord; page: ServerToolPageAccess; input: DiffInput; session: string; observe: boolean}) => Promise<{run: Run; report: DiffReport}>

export type Differ = {
  register(input: {input: TargetInput; session: string; page: ServerToolPageAccess}): Promise<TargetResult>
  run(input: {input: DiffInput; session: string}): Promise<DiffReport>
  refresh(input: {session: string}): Promise<void>
  touch(input: {file: string}): void
  capture(input: {id: string; session: string}): Promise<DiffReport>
  accept(input: {id: string}): Promise<TargetRecord>
  status(input: {session: string}): Promise<StatusReport>
  watch(input: {input: WatchInput; session: string}): Promise<WatchReport>
  xray(input: {id: string}): Promise<{report: DiffReport | null; outline: string[]}>
  dispose(): void
}

export type DesignRuntime = {cwd: string; blind: boolean; state: Storage; project: Storage; files: Storage; store: Store; adapters: TargetAdapter[]; measurer: Measurer; pairer: Pairer; deltas: Deltas; judge: Judge; words: Words; xrayUrl(input: {id: string; session: string}): {url: string; absolute: boolean}}
```

`Item`, `Stage`, `Stop`, `Typography`, `NodeLayout`, `Rgb`, `DiffInput`, `TargetInput`, `TargetResult`, `StatusReport`, `WatchInput`, `WatchReport` are reached as indexed types off the exports above (`Judge` return `['items'][number]`, `Run['stage']`, `Run['stop']`, `Decision['value']`, `DesignNode['layout']`, `Raster` method returns, `Parameters<Differ['run']>[0]['input']`, `Awaited<ReturnType<Differ['status']>>`). A consumer that spells one of them more than three times may declare a private alias.

## Rulings after the first defs.ts pass

- The list above is 27 names (one tool array, eleven domain types, four schemas, eleven stage types), plus `DESIGN_TOOL_PREFIX` for the CLI: 28 exports. The number in the heading was wrong; the names are the contract.
- `DESIGN_TOOLS` is a readonly tuple (`[targetDef, diffDef, statusDef, watchDef, captureDef, measureDef, renderDef, winnerDef, clearDef] as const`), so `tools.ts` and `client.tsx` destructure it positionally and keep each tool's typed input. The CLI passes it as `builtIns`; measure and render carry `catalog: false` and stay hidden as before.
- `Match.node` is the schema's base-plus-kinds shape without `children`, so `kind === 'text'` still narrows. `Omit` over the union would lose the kind fields.
- `DESIGN_GUIDE` and the blind variant are sentences the agent reads: `Words.guide(input: {blind: boolean}): string`. `designVerb` is private to the CLI's caller or gone. `DESIGN_EXTENSION_NAME` is defined where it is used.
- `ServerToolPageAccess` comes from `@conciv/extension/registry`, `defineTool` from `@conciv/extension/tool`.
- `walk` is a generator: `function* walk<T extends {children: T[]}>(root: T): Generator<{node: T; parent: T | null; index: number; depth: number}>`. A lookup is a `for...of` over it with a `return`.
- Keys on the fs driver cannot be both a file and a folder, so a run lives at `<target>:runs:<run>:run`, its images at `<target>:runs:<run>:live.png` and `:diff.png`, the target at `<target>:target.png`, captures at `captures:<stamp>.png`. `Run.images` holds keys; `store.path(key)` turns them into paths for the agent.
- `Store.put` takes `framework?: 'react' | 'solid'` and writes that placeholder; the differ detects the framework from the page at registration and passes it. `writePlaceholder` does not exist.
- Live-side text grouping and the typography estimate (client render tool) need the design and its raster, so they live in the deltas stage, not the measurer. If deltas.ts cannot hold them under the cap, one private sibling `server/typography.ts` with one export (`createTypography`) imported by deltas.ts only; its render cache is what `Deltas.dispose` releases.
- After the runner and differ pass: `Run` gains `capture: string` (hash of the live raster plus decisions; "page has not changed" and the accept check compare it), `section: string | null` (the section the round was run with) and `items` (the judge's ranked items, so watch rows are exact per run). `Runner` input gains `edited: string[]`. `Deltas.compute` input gains `excluded: Box[]` (design areas dropped before pairing, painted over in the live raster and left out of similarity) and its return gains `sections: {id: string; similarity: number}[]` and `timings: Record<string, number>`. A twin decision's value is `{target: string; node: string}`, a new member of `Decision['value']`; no separator string anywhere. `Words` gains `status(...)`, `watch(...)` and `hint(input: {kind: 'refused-route' | 'page-error' | 'hidden-tab' | 'next' | 'no-target' | 'image-unreadable'; ...})`: every sentence the agent reads leaves differ.ts. The differ never reads a store key; the outline is `words.outline(await store.design(id))`. Re-registering a target that is not the session's current one removes its runs first.
- Files that exist today and go: `server/geometry.ts` (into deltas.ts), `server/register.ts` (into differ.ts), `server/rankers.ts` (into judge.ts). The earlier "Gone" list named files already removed.

## Files, one export each

| file                           | export                                                                                                                         | reference in the old tree (branch `design-one-tree` at 56fca6f92, or `design-driver-figma` at 1a1ed0175 where named)                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/defs.ts`               | the 21 above                                                                                                                   | current defs.ts for schema bodies and tool defs                                                                                                  |
| `shared/tree.ts`               | `walk`                                                                                                                         | current; `find` becomes a `walk` with an early return at the caller                                                                              |
| `shared/box.ts`                | `box` object: `{union, expand, encloses, overlaps, area, intersection, centre, distance, readingOrder, sameLine, holds}`       | current box.ts plus geometry.ts                                                                                                                  |
| `shared/tolerances.ts`         | `designConfig` (the zod config; `TOLERANCES` is `designConfig` parsed defaults, reached as a property)                         | current                                                                                                                                          |
| `server/raster.ts`             | `createRaster(png: Uint8Array): Raster`                                                                                        | current raster.ts                                                                                                                                |
| `server/sources/figma.ts`      | `createFigmaAdapter(input: {token: string \| null; config: DesignConfig}): TargetAdapter`                                      | current sources/figma.ts; colour sampling from the rendered PNG as on 1a1ed0175                                                                  |
| `server/sources/roles.ts`      | `assignRoles(root: DesignNode): DesignNode` (text roles: placeholder, data, unknown), imported by both adapters                | role rules in current sources/image.ts                                                                                                           |
| `server/sources/image.ts`      | `createImageAdapter(input: {config: DesignConfig}): TargetAdapter`                                                             | current sources/image.ts; readers, segmenters, roles private tables                                                                              |
| `server/sources/layout.ts`     | `inferLayout(root: DesignNode): DesignNode`                                                                                    | current                                                                                                                                          |
| `server/store.ts`              | `createStore(input: {state: Storage; words: Words}): Store`                                                                    | current store.ts                                                                                                                                 |
| `server/measure.ts`            | `createMeasurer(input: {config: DesignConfig}): Measurer`                                                                      | current measure.ts; comparator and colour tables private; takumi and text grouping private                                                       |
| `server/pairers/vote.ts`       | `createVotePairer(): Pairer`                                                                                                   | current vote.ts; imports `./similarity.js` only                                                                                                  |
| `server/pairers/similarity.ts` | `createSimilarity(): Similarity` (type is `ReturnType`)                                                                        | current                                                                                                                                          |
| `server/deltas.ts`             | `createDeltas(input: {config: DesignConfig; project: Storage}): Deltas`                                                        | current deltas.ts plus kinds, sides, geometry align/targetBox/selectors, and provenance attribution through `./provenance.js`                    |
| `server/provenance.ts`         | `createProvenance(input: {project: Storage}): Provenance` (type is `ReturnType`), imported by deltas.ts only                   | current                                                                                                                                          |
| `server/judge.ts`              | `createJudge(input: {config: DesignConfig}): Judge`                                                                            | current judge.ts; rankers private                                                                                                                |
| `server/words.ts`              | `createWords(input: {config: DesignConfig}): Words`                                                                            | current words.ts; the report assembly from judge.ts `report`, `section`, `hint`; `guide` from defs.ts `DESIGN_GUIDE` and server.ts `BLIND_GUIDE` |
| `server/runner.ts`             | `createRunner(runtime: DesignRuntime): Runner`                                                                                 | current runner.ts: measure, CSS px conversion, pair, deltas, judge, words, store.writeRun, timings                                               |
| `server/differ.ts`             | `createDiffer(input: {runtime: DesignRuntime; runner: Runner; page: DesignPage; bundler: BundlerBridge \| undefined}): Differ` | current differ.ts, register.ts, twins.ts, settle (HMR quiet), status/watch projections                                                           |
| `server/tools.ts`              | `SERVER_STEPS`                                                                                                                 | current                                                                                                                                          |
| `server/xray-routes.ts`        | `createXrayRoutes(input: {runtime: DesignRuntime; differ: Differ; pageDir: string; takumiDir: string}): {router; app}`         | current                                                                                                                                          |
| `server.ts`                    | `design`                                                                                                                       | current; the only file that imports a `create*`                                                                                                  |

Gone: `geometry.ts`, `register.ts`, `twins.ts`, `rankers.ts`, `kinds.ts`, `sides.ts`, `pixels.ts`, `elements.ts`, `css.ts`, `status.ts`, `settle.ts`, `loop.ts`, `pair.ts`, `target.ts`, `shared/types.ts`.

## Data flow

```
design_target ─ Differ.register ─ adapter.load ─ Store.put (design, image, outline, placeholder)
design_diff   ─ Differ.run ─ settle(HMR) ─ Runner:
    Measurer.measure(page)                    → Measured (live tree, raster)
    design in CSS px, excluded dropped        (private to runner)
    Pairer({design, measured, previous})      → root: Match
    Deltas.compute({root, measured, target})  → root with deltas, extras, warnings, mismatch, diff raster
    Judge({root, extras, previous, rounds})   → root with status, score, stage, stop, items
    Words.report(...)                         → DiffReport
    Store.writeRun({run, live, diff})
design_status, design_watch ─ Differ projections over Store.latest(id).root with walk
x-ray ─ Differ.xray ─ Words.outline, Store.latest
```

## Hash

`DesignNode.hash` is sha256 of the node's own fields plus its children's hashes, written by the sources. `Match.hash` is sha256 of the live fingerprint plus the children's hashes, written by the pairer. Carry-over: a node whose `hash` equals the same id's hash in `previous` keeps its pairing without a vote. Changes between runs: nodes whose `hash` differs.

## Tests

`packages/it/test/design.it.test.ts` is rewritten against this contract: the tools over RPC, `createStore` on `memoryDriver`, the adapters, the pairer, the judge. Assertions of behavior keep their values; the test never imports a private helper. Package `exports` are `.`, `./client`, `./server`, `./defs`, `./package.json`.

## The one gate

Typecheck, lint and build of the package; the design integration test; the tag3 recipe on OrangeFarm and Pricing with the journal numbers equal to `tag3-figma5-1` and `tag3-figma2-1`. Nothing is run between stage files.
