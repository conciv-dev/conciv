# Design extension, one tree: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat node list and its ten id-keyed side shapes with one design tree, one run tree, one storage interface and one adapter interface, keeping every tool contract and every existing test.

**Architecture:** `Design.root` is a tree of `DesignNode`; a run returns `Match`, the same tree annotated with the paired live element, deltas and status. Every report, ledger, watch row, outline and change list is a walk over that tree. All persistence goes through unstorage; every stage boundary is a type in `shared/defs.ts`; only `server.ts` imports an implementation.

**Tech Stack:** TypeScript, zod 4 (`z.lazy` for the recursive node), unstorage (new, catalog), es-toolkit, vitest in `packages/it`.

**Spec:** `docs/superpowers/specs/2026-11-05-design-one-tree.md`. Read it first; this plan does not repeat its tables.

## Global Constraints

- Branch `design-one-tree` off `design-driver-figma` at 1a1ed0175. Commit locally after each task, message prefixed `design:`. Never push, never open a PR, never amend, never rebase, never `git stash`, no AI attribution lines.
- House style: functions not classes, no IIFEs, no `else`, no `let`, early returns, one options-object argument, no casts, no `any`, no non-null assertions, no code comments, exported thing at the top of a file and private helpers below in call order, no loose files at `src/` root.
- Types derive from schemas with `z.infer`; no hand-written twin of a schema anywhere.
- No `node:fs` import under `src/` after Task 2. No import of `./sources/*`, `./pair.js`, `./words.js`, `./store.js` outside `server.ts` after Task 5.
- Tool input and output schemas (`TargetInputSchema`, `DiffInputSchema`, `DiffReportSchema`, `CompactReportSchema`, `StatusReportSchema`, `WatchInputSchema`, `WatchReportSchema`, `CaptureInputSchema`, `WinnerInputSchema`, `ClearInputSchema`) keep their shape. `WatchRow.ref` is the one exception: it stays in the schema and is filled with `node` for a Figma design and `null` for an image.
- Never edit an existing test. `packages/it/test/design.it.test.ts` has 42 of 199 cases failing at the base commit; the set must be identical at the end, recorded by name before Task 1.
- Never print, log or write `FIGMA_API_KEY` or `TYPESAFE_API_KEY`. Pipe any command that could emit a token through `sed -E "s/figd_[A-Za-z0-9_-]+/<key>/g"`.
- Gate per task: `pnpm run lint` clean in `packages/extensions/design`; `pnpm run typecheck` errors confined to the files later tasks will rewrite (list the files and the count in the task's commit message body). From Task 5 on, typecheck is clean everywhere.
- The client (`src/client.tsx`) and the x-ray (`src/xray/*`) are not rewritten; they change only at the lines where an old type or route payload is read.

## Review Focus

1. A Figma frame whose root has a child that is itself a frame with children: the tree must nest three deep and `design_watch` must list the grandchild with its Figma id. Test in Task 3.
2. A paired node whose element disappears on the next run: status goes `paired` to `regressed`, `since` becomes that run, `live` is null, and the previous pair path survives nowhere else. Test in Task 5.
3. An image design where two segmented boxes overlap partially: nesting by containment must not loop or drop either; the smaller one is a sibling. Test in Task 3.
4. A run on a target with no earlier run: every node starts `unbuilt` or `paired`, never `regressed`. Test in Task 5.
5. `design_clear` with `all: true` removes every key under `state`, including run PNGs and captures, and `list` returns empty. Test in Task 2.

---

### Task 1: Schemas, types, tree utilities

**Files:**

- Modify: `packages/extensions/design/src/shared/defs.ts`
- Modify: `packages/extensions/design/src/shared/types.ts`
- Create: `packages/extensions/design/src/shared/tree.ts`

**Interfaces:**

- Produces in `defs.ts`: `DesignNodeSchema` (recursive through `z.lazy`, discriminated on `kind` with `text | box | image` carrying exactly the per-kind fields the spec lists), `DesignSchema`, `MatchSchema`, `RunSchema`, `AttachmentsSchema`, and the derived types `DesignNode`, `Design`, `Match`, `Run`, `Attachments`. `TargetAdapter`, `Pairer`, `Ranker`, `Store`, `Words` types as the spec writes them, in `defs.ts`.
- Produces in `tree.ts`: `walk<T extends {children: T[]}>(input: {root: T}): Iterable<{node: T; parent: T | null; index: number; depth: number}>` (pre-order) and `find<T extends {children: T[]}>(input: {root: T; id: string}): T | null` where `T` has `id`. For `Match`, `id` is `node.id`; give `find` an `idOf` option defaulting to `node.id`.
- Removes from `types.ts`: `TargetNode`, `TextNode`, `BoxNode`, `ImageNode`, `TargetModel`, `TargetRoot`, `TargetAdapter`, `Pair`, `Matched`, `PairRecord`, `TwinPair`, `TwinVote`, `DesignSection`, `StoredRun`, `TargetStore`, `Pairer`, `Ranker`. What remains in `types.ts` is only what no schema defines (`LiveComponent`, `LiveStyles`, `Raster`, `Glyph`, `Opinion`, `Winner`, `Provenance`, `CssMap`, `DesignRuntime`, `Differ`, `ServerStep`); move those to `defs.ts` too if they fit without a schema, and delete `types.ts` when it is empty.

- [ ] **Step 1: Record the baseline failing set.** From `packages/it`: `pnpm test -- test/design.it.test.ts 2>&1 | grep -E '✗|×|FAIL' | sort > /tmp/design-it-base.txt`; keep the file for Task 6.
- [ ] **Step 2: Write the schemas and types** in `defs.ts` exactly as the spec's `DesignNode`, `Design`, `Match`, `Run` blocks; `Decision` gains kind `twin`.
- [ ] **Step 3: Write `tree.ts`** with `walk` and `find`; a generator for `walk`.
- [ ] **Step 4: Delete the replaced types** from `types.ts`; fix only `shared/*` and `xray/*` imports (they read types, not data). Leave `server/*` red.
- [ ] **Step 5: Gate.** `pnpm run lint` clean. `pnpm run typecheck` red only in `server/*`; count the errors.
- [ ] **Step 6: Commit** `design: one tree: schemas, Match, Run, walk and find`.

### Task 2: Storage through unstorage

**Files:**

- Modify: `pnpm-workspace.yaml` (catalog: `unstorage`), `packages/extensions/design/package.json`
- Rewrite: `packages/extensions/design/src/server/store.ts`
- Modify: `packages/extensions/design/src/server.ts` (build `state` and `project`, pass them in `DesignRuntime`, replace the six `readFile`/`readdir` sites)
- Modify: `packages/extensions/design/src/server/differ.ts` (the five provenance and CSS reads use `runtime.project`)

**Interfaces:**

- Consumes: `Store`, `Run`, `Design` from Task 1.
- Produces: `createStore(state: Storage): Store` with the fourteen methods of the spec; keys exactly as the spec's key table; `DesignRuntime` gains `state: Storage` and `project: Storage`.

- [ ] **Step 1: Add the dependency.** `unstorage` in the catalog at the current release; `"unstorage": "catalog:"` in the package; `pnpm install` from the package.
- [ ] **Step 2: Rewrite `store.ts`.** JSON values through `getItem`/`setItem` parsed with the Task 1 schemas on read; PNG through `getItemRaw`/`setItemRaw`. `remove({all: true})` is `clear()`. `runs(id)` is `getKeys(`${id}:runs`)` filtered to the run keys. Old-run pruning keeps the five newest and the accepted run.
- [ ] **Step 3: Wire `server.ts`.** `state = createStorage({driver: fsDriver({base: join(server.stateDir, 'design')})})`, `project = createStorage({driver: fsDriver({base: server.cwd, readOnly: true})})`; `cssFiles` becomes `project.getKeys('src')` filtered to `.css`; the four route reads of page, live PNG and x-ray files go through `state` or a package storage over `fileURLToPath(new URL('xray/', import.meta.url))`.
- [ ] **Step 4: Differ reads.** The provenance source and stylesheet reads and the `readdir` use `runtime.project.getItem` and `getKeys`; the OCR model bytes in the text reader load through `createStorage` over the model directory.
- [ ] **Step 5: Gate.** `grep -rn "node:fs" src/` returns nothing. Lint clean. Typecheck red only in `server/target.ts`, `server/pair.ts`, `server/loop.ts`, `server/differ.ts`.
- [ ] **Step 6: Commit** `design: storage through unstorage, no node:fs in src`.

### Task 3: Sources

**Files:**

- Create: `packages/extensions/design/src/server/sources/figma.ts`, `packages/extensions/design/src/server/sources/image.ts`
- Delete: `packages/extensions/design/src/server/target.ts`
- Modify: `packages/extensions/design/src/server/differ.ts` (receives `registerTarget` and the current-target-per-session code from `target.ts`, bound to `Store`), `packages/extensions/design/src/server.ts` (`adapters: [imageAdapter, createFigmaAdapter({token})]`)

**Interfaces:**

- Consumes: `TargetAdapter`, `Attachments`, `Design`, `DesignNode` from Task 1; `Storage` from Task 2.
- Produces: `createFigmaAdapter(input: {token: string | null}): TargetAdapter`; `imageAdapter: TargetAdapter`; the image side keeps `TEXT_READERS`, `SEGMENTERS`, `ROLE_RULES`, `ENRICHERS`, `destroyPaddle` as exports of `sources/image.ts` since `server.ts` wires them.

- [ ] **Step 1: `sources/figma.ts`.** `parseFigmaLink`, the document and REST sources, and one recursive `designNode(input: {node: FigmaNode; parentBox; scale}): DesignNode` replacing `modelFrom`. `id` is the Figma node id. Boxes relative to the root as today; `within` is gone because `children` carries it.
- [ ] **Step 2: `sources/image.ts`.** Everything from `target.ts` that serves the image adapter, plus `nest(input: {nodes: FlatNode[]}): DesignNode[]`: sort by area descending, each node becomes a child of the smallest earlier node whose box encloses it (`encloses` from `raster.ts`, tolerance as today's `within` assignment used), else a root child. Partial overlap is a sibling.
- [ ] **Step 3: Registration** moves to `differ.ts`; the consumer line is the spec's two-liner; `attachments` built from `input.document` and the decoded `input.image`.
- [ ] **Step 4: Gate.** Lint clean. Typecheck red only in `server/pair.ts`, `server/loop.ts`, `server/differ.ts`. Review Focus 1 and 3 are checked in Task 6's tests through `design_watch` and the stored design.
- [ ] **Step 5: Commit** `design: sources behind one adapter interface, figma as a tree`.

### Task 4: Pairing returns a Match tree

**Files:**

- Rewrite: `packages/extensions/design/src/server/pair.ts`

**Interfaces:**

- Consumes: `Design`, `DesignNode`, `Match`, `LiveComponent`, `Decision`, `Pairer`, `Ranker`, `walk`, `find`.
- Produces: `PAIRERS` and `RANKERS` tables as today, where a `Pairer` is `(input: {design: Design; live: LiveComponent; decisions: Decision[]; comparators: Comparators}) => Promise<Match>`; `fingerprint(live: LiveComponent): Fingerprint` stays, computed on demand.

- [ ] **Step 1: Delete** `Tree`, `Seat`, `placement`, `laidOut`, `pairTree`, `pairTwins` as a separate pass (twins become decisions of kind `twin` read by the pairer), and every `parent`/`prev`/`next`/`depth` upkeep.
- [ ] **Step 2: Recursion.** `pairNode(input: {node: DesignNode; candidates: LiveComponent[]; ...}): Match` pairs the node by the existing vote, then pairs `node.children` against the paired element's subtree (or the same candidates when unpaired). Alignment and glyph matching stay as the scoring inside the vote.
- [ ] **Step 3: Gate.** Lint clean. Typecheck red only in `server/loop.ts`, `server/differ.ts`.
- [ ] **Step 4: Commit** `design: pairers return a Match tree`.

### Task 5: The run, the words, the projections

**Files:**

- Rewrite: `packages/extensions/design/src/server/differ.ts`
- Create: `packages/extensions/design/src/server/words.ts`
- Delete: `packages/extensions/design/src/server/loop.ts`

**Interfaces:**

- Consumes: everything above.
- Produces: `createDiffer({runtime, store, page}): Differ` with the same `Differ` methods; `Words` from `words.ts`: `outline(design: Design): string[]`, `itemSentence(input: {match: Match; delta: Delta; parent: Match | null}): string`, `changeSentence(...)`, `stalledLine(...)`, `flippedLine(...)`; byte-identical output for the strings the existing tests assert.

- [ ] **Step 1: One run.** Measure, pair (Task 4), deltas per `Match`, `nextStatus(input: {previous: Match | null; now: Match; accepted: boolean}): NodeStatus` with `since`, judge and stop rules from `loop.ts` operating on `walk(run.root)`, then `store.writeRun`.
- [ ] **Step 2: Projections.** `design_diff` report rows, `changes`, `unmatched`, counts; `design_status`; `design_watch` rows; `design` outline for `full: true`; all from `Run` through `walk`. `watchSettled` moves here unchanged in behavior.
- [ ] **Step 3: `words.ts`.** The sentence functions from `loop.ts` and `designOutline` from `store.ts`, with single-caller helpers inlined.
- [ ] **Step 4: Gate.** Lint clean, typecheck clean for the whole package, `pnpm run build` passes. Import rule grep from the spec matches only `server.ts`.
- [ ] **Step 5: Commit** `design: one run tree; loop.ts dissolves into differ and words`.

### Task 6: Proof

- [ ] **Step 1:** From `packages/it`: `pnpm test -- test/design.it.test.ts`, failing set compared to `/tmp/design-it-base.txt`; must be identical.
- [ ] **Step 2:** Review Focus checks by hand through the trial script `packages/it/scripts/design-trial.ts`: a three-deep Figma frame from `scratchpad/figma5/rest-raw.json` listed by `watch`, a regressed node after deleting its element, a fresh target with no `regressed`, `clear all` leaving `list` empty. Record the commands and outputs in the task report.
- [ ] **Step 3:** Report `wc -l src/server/*.ts src/server/sources/*.ts src/shared/*.ts` before and after.
- [ ] **Step 4: Commit** nothing new unless a fix was needed; the fix is its own `design:` commit.

The tag3 rerun on OrangeFarm and Pricing is run by the orchestrator from the scratch harness after Task 6, not by the implementer.
