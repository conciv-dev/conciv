# Design extension: one tree

## The problem

The design side is a flat list of nodes with a `within` string naming the parent. The live side is a real tree (`children`). Everything in between is another flat shape keyed by node id string: `Pair` (with hand-kept `parent`, `prev`, `next`, `depth`), `Matched`, `PairRecord`, `TwinPair`, `Item`, `Delta`, `LedgerEntry`, `WatchRow`, the report rows, `DesignSection`, `StoredRun`.

Because the design has no tree, 45 call sites rebuild one: `groupBy(within)`, `childrenIn`, `descendantsIn`, `pairTree`, `placement`, `laidOut`, `designSections`, `topNodes`. `layout.ts` exists only to compute a `Tree` and a `Seat` from the flat list. The ledger joins pairs back to nodes by id. `watchRows` joins nodes to the ledger by id. The brief outline walks the flat list with a depth counter. The store has 26 methods because each flat shape gets its own file.

That is the entropy. Not file layout, not helper count. Ten views of one relationship, each re-deriving the relationship.

## The structure

One tree. Every stage is a walk over it.

```ts
type DesignNode = {
  id: string // from the source: the Figma node id, or image hash plus index
  box: Box // design px
  layout?: ContainerLayout
  children: DesignNode[]
} & (
  | {kind: 'text'; text: string; lines: OcrLine[]; confidence: number; role?: Role; typography?: Typography}
  | {kind: 'box'; paint?: Paint; border: Border | null; radius: number}
  | {kind: 'image'; holds: number}
)

type Design = {
  id: string
  source: {kind: 'image' | 'figma'; ref: string}
  viewport: {width: number; height: number}
  scale: number
  root: DesignNode // the frame; its children are the sections
}
```

A run pairs the design tree with the live tree and writes the result on the same shape:

```ts
type Match = {
  node: DesignNode
  live: LiveComponent | null // null = unbuilt
  confidence: number
  source: MeasureSource
  deltas: Delta[] // empty = clean
  status: NodeStatus // unbuilt | paired | done | regressed | accepted
  since: string // run that reached the status
  children: Match[]
}

type Run = {
  id: string
  round: number
  design: string // Design.id
  root: Match
  extras: LiveComponent[] // live elements no design node claimed
  score: number[]
  stop: Stop | null
  images: {live: string; diff: string}
}
```

`LiveComponent` stays as it is: the client already produces a tree.

Twins are a `Decision` with kind `twin`, anchor the node id, value the other target's node id. Decisions stay a flat list per target; they are user input, not derived state.

## Interfaces, not implementations

Every stage boundary is a type in `defs.ts`. A consumer imports the type and receives the implementation as an argument; it never imports an implementation module. `server.ts` is the only place that names one and wires it in.

| Interface                                      | Implemented by                         | Consumed by                            |
| ---------------------------------------------- | -------------------------------------- | -------------------------------------- |
| `Storage` (unstorage)                          | `fsDriver`, `memoryDriver` in tests    | `store.ts`, sources, differ provenance |
| `Store`                                        | `createStore(state)`                   | `differ.ts`, `server.ts` routes        |
| `TargetAdapter`                                | `sources/figma.ts`, `sources/image.ts` | `differ.ts` registration               |
| `Pairer`, `Ranker`                             | `pair.ts` tables                       | `differ.ts`                            |
| `PixelComparator`, `ColorMetric`, `TextReader` | `raster.ts`, `sources/image.ts`        | `differ.ts`                            |
| `Words`                                        | `words.ts`                             | `differ.ts`                            |

Rule for a reviewer: `grep "from './sources/\|from './pair\|from './words\|from './store"` matches only in `server.ts`. Everything else takes what it needs through `DesignRuntime`.

## Sources

A `TargetAdapter` turns a source into a `Design`. Same output type for every source, and nothing after the adapter knows which source it was: `source.kind` is display only, no branch on it anywhere downstream. A Figma node with text and an OCR line from an image both become the same `{kind: 'text'}` node; the only difference is the `confidence` value. Two adapters, same interface:

- **Figma.** The Figma document is already this tree. `createFigmaAdapter` becomes one recursive map, Figma node to `DesignNode`, `id` the Figma node id, `children` from `children`. Today's `modelFrom` flattens the tree to a list with `within` and the rest of the code rebuilds it. Both halves go. The document and REST sources stay: the agent's MCP fetch pasted as `document`, or REST with `FIGMA_API_KEY`, one parse either way.
- **Image.** Segmentation yields flat boxes. The adapter nests them by containment once, at load, and never again. Ids stay the hash plus index.

The interface, in `defs.ts`:

```ts
type TargetAdapter = {
  kind: string
  accepts(input: {ref: string; project: Storage}): boolean
  load(input: {ref: string; scale: number; project: Storage; attachments: Attachments}): Promise<Design>
}
type Attachments = {document?: unknown; image?: Uint8Array}
```

The consumer is one line and never names a source:

```ts
const adapter = adapters.find((candidate) => candidate.accepts({ref, project}))
const design = await adapter.load({ref, scale, project, attachments})
```

A new source (Sketch, Penpot, a URL to a live site) is one file in `server/sources/` and one entry in the `adapters` array in `server.ts`. Nothing else changes. `attachments` is whatever the agent pasted alongside the ref; an adapter uses what it needs and ignores the rest.

`design_watch` rows carry `ref` today for the Figma id; with Figma ids as `id` that column folds into `node`.

## What becomes a projection

| Today                                                                | Tomorrow                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `TargetModel.nodes[]` plus `within`                                  | `Design.root`                                                                             |
| `DesignSection[]`, `sections(id)`                                    | `design.root.children`                                                                    |
| `Tree`, `Seat`, `placement`, `laidOut`, `layout.ts`                  | tree walk with the parent in hand                                                         |
| `pairTree`, `Pair.parent/prev/next/depth`                            | `Match.children`; siblings are the parent's array                                         |
| `PairRecord[]`, `pairs-<run>.json`                                   | walk `run.root`, pick `live`                                                              |
| `Ledger`, `ledger.json`, `nextLedger`, `ledgerPairs`, `ledgerCounts` | `status` and `since` on `Match`; `nextStatus(previous: Match, now: Match)` on the same id |
| `watchRows` join                                                     | walk `run.root`, filter                                                                   |
| `Item[]`, `itemsFrom`                                                | walk `run.root`, one item per delta, rank                                                 |
| `designOutline`, `topNodes`, `outlineLines`                          | one recursive walk that writes a line per node                                            |
| `changesBetween`, `nearestSighting`, `flattened`                     | diff `previous.root` and `run.root` by id                                                 |
| `StoredRun`, `lastResult`, `latestRun`, `run`, `tiles`, `amend`      | `run(id, run)`, `writeRun(run)`                                                           |

One utility: `walk(root, visit)` yielding `{match, parent, index}`. One lookup: `find(root, id)`. Nothing else indexes the tree.

## Storage

No `node:fs` import anywhere in `src/`. Today four modules read and write files (`store.ts` 40 sites, `target.ts` 7, `server.ts` 6, `differ.ts` 5). All of it goes behind [unstorage](https://unstorage.unjs.io) (`unstorage`, new dependency, catalog entry), two instances built in `server.ts` and passed down:

```ts
const state = createStorage({driver: fsDriver({base: join(server.stateDir, 'design')})})
const project = createStorage({driver: fsDriver({base: server.cwd, readOnly: true})})
```

`state` holds every design artifact under one key space, JSON through `getItem`/`setItem`, PNG through `getItemRaw`/`setItemRaw`:

```
<target>:design           Design
<target>:record           TargetRecord
<target>:decisions        Decision[]
<target>:runs:<run>       Run
<target>:runs:<run>:live  png
<target>:runs:<run>:diff  png
<target>:target           png
captures:<stamp>          png
```

`project` is how the differ reads a source file or a stylesheet for provenance, how `server.ts` lists CSS files, and how the image adapter reads a design image given as a path. Package assets (the OCR model files) load through a third `createStorage` over the package directory in the text reader, once.

The store is then one thin module over `state`:

```ts
function createStore(state: Storage): Store
type Store = {
  put(input: {design: Design; session: string; route?: string; name?: string}): Promise<TargetRecord>
  design(id: string): Promise<Design>
  record(id: string): Promise<TargetRecord | null>
  current(session: string): Promise<TargetRecord | null>
  list(route?: string): Promise<TargetRecord[]>
  remove(input: {id?: string; all?: boolean}): Promise<number>
  runs(id: string): Promise<string[]>
  run(input: {id: string; run: string}): Promise<Run | null>
  writeRun(input: {run: Run; live: Uint8Array; diff: Uint8Array}): Promise<void>
  decisions(id: string): Promise<Decision[]>
  decide(input: {id: string; kind: DecisionKind; anchor: string; value: Decision['value']}): Promise<Decision>
  revoke(input: {id: string; decision: string}): Promise<boolean>
  accept(input: {id: string; run: string}): Promise<TargetRecord>
  writeCapture(png: Uint8Array): Promise<string>
}
```

Keys that the fs driver turns into both a file and a directory are not allowed, so a run's JSON sits at `<target>:runs:<run>:run` beside its `live.png` and `diff.png`; image keys end in `.png` so the x-ray serves them by type.

Agents read some artifacts by file path (the design outline, the placeholder source, the live and diff images). The store exposes `path(key)`, the fs driver's base joined with the key, and writes the outline and the placeholder as `<target>:design.txt` and `<target>:placeholder.tsx` when `put` runs. A typography override is a `Decision` of kind `typography`, not a write into the design.

Tests build the store over `memoryDriver()`; no temp directories. The brief text and the placeholder source are written from the design on demand, not stored. Pruning old runs is `getKeys(`${target}:runs`)` and `removeItem`, not directory listing by filename prefix.

## Pairing

A pairer takes `{design: DesignNode, live: LiveComponent, decisions}` and returns `Match`. Structure first is recursion: pair the node, then pair its children against the paired element's subtree. The vote across pairers stays; it votes per node inside the recursion. Fingerprints are computed from `live` when needed, not stored on a separate record.

## Tool contracts

`design_target`, `design_diff`, `design_status`, `design_watch`, `design_capture`, `design_decide`, `design_accept` keep their input and output schemas in this change. Every output is a projection of `Run`; the schemas move from `defs.ts` only if a field no longer exists. A later change may flatten the report once the agent prompt is retuned against it.

## Modules after

```
server.ts                 extension entry, routes, runtime, the two storages
server/sources/figma.ts   createFigmaAdapter: link parse, document and REST fetch, Figma tree to Design
server/sources/image.ts   imageAdapter: OCR, segmentation, roles, nesting by containment, to Design
server/raster.ts          pixels: decode, crop, compare, color
server/pair.ts            pairers and rankers: Design plus LiveComponent to Match
server/differ.ts          a run: measure, pair, deltas, judge, stop; the tool bindings
server/words.ts           every sentence the agent reads: outline, items, changes
server/store.ts           createStore over unstorage
shared/defs.ts            schemas and the TargetAdapter interface; types by z.infer, no hand-written twins
shared/tolerances.ts
```

`server/sources/` is the one folder: one file per adapter, both implementing `TargetAdapter` from `defs.ts`, registered in `server.ts` as today. `target.ts` is gone; its registration code (`registerTarget`, current target per session) lives in `differ.ts` beside the other tool bindings.

`loop.ts` dissolves: the run loop goes to `differ.ts`, the prose to `words.ts`. Types in `shared/types.ts` that a schema already defines are deleted; the rest move to `defs.ts`.

## What this removes

Measured on the branch at 1a1ed0175: `layout.ts` whole, `ledger` section of `store.ts`, `pairTree` and the linked-list upkeep in `pair.ts`, every `within` grouping, `designSections`, `watchRows`, `itemsFrom`'s flattening, `nearestSighting` and `flattened`, nine store methods, `PairRecord`, `Matched`, `LedgerEntry`, `DesignSection`, `StoredRun`, `Tree`, `Seat`. Estimate: 2,500 of 10,000 server lines, before any prose cleanup.

## Not in this change

Client measurement, the x-ray UI, the agent guide text, tolerance tables, the takumi second opinion. They read `Run` instead of the old shapes and change only at the call.

## Proof

The existing design integration tests run unchanged against the new shapes. The tag3 recipe is rerun on OrangeFarm and Pricing with the same gate numbers as the journal rows `tag3-figma5-1` and `tag3-figma2-1`.
