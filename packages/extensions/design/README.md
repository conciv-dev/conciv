# @conciv/extension-design

Internal to `@conciv/it`. The design extension holds a target image per route and viewport width, captures the live
page at that width, and returns the components that differ from the design, ranked, with the measured deltas and the
source location that sets each value.

## Overview

The package.json describes this as the design built-in extension, internal to @conciv/it. It holds a target image per route and width, reads the target's text once with OCR, captures the live page at that width and returns ranked component deltas with style provenance. The root exports pick a browser condition (dist/client.js) or an import condition (dist/server.js), with subpaths ./client, ./server, ./defs, ./provenance, ./text-groups, ./paddle, ./colors, ./types and ./xray-routes (types of the x-ray router). The `build` script runs four steps in order: tsdown, vite build (client), vite build with vite.xray.config.ts (xray page into dist/xray), then tsc declaration emit (src/**/*.ts and src/client.tsx, which pulls in the x-ray modules it mounts).

## Interface

- default `defineConfig` (`tsdown.config.ts`): bundles `src/server.ts`, `src/shared/defs.ts`, `src/server/provenance.ts`, `src/server/differ.ts`, `src/server/target.ts` and `src/server/deltas.ts` as ESM with `dts: false`
- default `defineConfig` (`vite.config.ts`): library build of `src/client.tsx` with the Solid plugin to `client.js` (ES format), with `emptyOutDir: false` and sourcemaps
- default `defineConfig` (`vite.xray.config.ts`): builds `src/xray/` into `dist/xray/` with UnoCSS and the Solid plugin, the stylesheet at the stable name `assets/index.css` that the in-tab pane links; in serve mode it loads `../../it/dist/vite.js` instead of plain Solid
- default `defineConfig` (`uno.config.ts`): UnoCSS with `presetConciv`, scanning `src/xray/**` and `../../ui-kit-system/src/**`
- package.json `exports`: `.` (browser maps to client, import maps to server), `./client`, `./server`, `./defs`, `./provenance` (`dist/server/provenance`), `./text-groups` (`dist/server/differ`), `./paddle` (`dist/server/target`), `./colors` (`dist/server/deltas`), `./types` and `./xray-routes` (types only)
- package.json script `dev:xray`: runs `vite --config vite.xray.config.ts`

## Source tree

Each slot is one interface in `src/shared/types.ts`. Every implementation of a slot is a module-private function or
object in one file, and that file exports one table of them; `src/server.ts` picks from the tables by `designConfig`.

```text
src/
  client.tsx           widget entry: measurer, mirror, region and snapdom capture, type renders, CSS winner,
                       the composer button and the Surface that mounts the x-ray pane in the tab
  client/
    takumi.ts          the takumi second opinion: lays the mirror snapshot out at the design width in wasm
  server.ts            extension entry: pickRuntime over the slot tables, CSS map, x-ray routes, dispose
  shared/
    defs.ts            tool definitions, wire schemas, errors and messages
    types.ts           domain types and the slot interfaces
    tolerances.ts      TOLERANCES, designConfig, frame message names, source attribute, property aliases, tolerance counts
  server/
    target.ts          ADAPTERS, TEXT_READERS (PaddleOCR), ENRICHERS, SEGMENTERS, ROLE_RULES and the registration pipeline
    layout.ts          the layout pass over the segmented tree (direction, gap, align, wrap, padding, runs, sizes)
    deltas.ts          DELTA_KINDS (border, axis and columns included), COLOR_METRICS, sampled fills and glyph ink color, sideFrom
    provenance.ts      MAPPERS, mapDeclaration, the CSS source map, JSX site reading and live text roles
    raster.ts          pure pixel and box operations
    store.ts           the target store on disk
    ledger.ts          the node ledger: statuses per run, the changes against the ledger before, the carried pairs
    pair.ts            PAIRERS (the calibrated vote), RANKERS (impact), the pair tree, alignment offsets and pairTwins
    loop.ts            items, stages, score, brief and stop rules, round history, the run queue and the HMR settle trigger
    differ.ts          PIXEL_COMPARATORS, text groups, the diff run, unbuilt, extra and offset entries, and the tool bindings
    xray-routes.ts     HTTP routes for the x-ray: targets, current, stamp, report, pin, unpin, mark, revoke,
                       accept and capture, and the node crop PNG
  xray/
    entry.tsx          mount
    router.tsx         routes, search schema, data loading, the in-tab pane (memory history)
    panel.tsx          panel, rows, detail, fix prompt
    decisions.tsx      the run bar, pins, marks, accept, Capture pixels, the row outline
    heatmap.tsx        node by registered width, worst stage per cell
    stage.tsx          canvas and stage toolbar
    states.tsx         loading, empty and error states, shortcuts
```

`src/client/specificity.d.ts` types `@bramus/specificity`. `src/xray/index.html` and `src/xray/xray.css` are the
x-ray page shell. `test/dev-fixture.ts` is the sample data `dev:xray` shows with `?fixture=1`.

## Invariants

- `rollupOptions.external` (`vite.config.ts`) treats imports matching solid-js, zod, @conciv/, lucide-solid, rrweb, @rrweb/, @tanstack/, @orpc/, @zumer/ or @bramus/ as external unless the import path contains `.css`
- `renderBuiltUrl` (`vite.xray.config.ts`) prefixes HTML asset URLs with `xray/` and uses relative URLs for JS and CSS
- `tsconfig.build.json` includes `src/client.tsx`; the x-ray modules it imports get declarations, `src/xray/entry.tsx` does not
- `ppu-paddle-ocr`, `ppu-ocv` and `onnxruntime-web` are pinned exactly (see [OCR engine](#ocr-engine))

## Side Effects

- `build` script (package.json): writes dist/ (server.js, shared/defs.js, server/provenance.js, server/differ.js, server/target.js, server/deltas.js, client.js, xray/, .d.ts files); the xray build empties `dist/xray/` (`emptyOutDir: true` in `vite.xray.config.ts`)
- `compiler` (`vite.xray.config.ts`): in serve mode it dynamically imports the sibling package build at `../../it/dist/vite.js`
- `design_target` runs OCR in-process on `onnxruntime-web`; the service is created on first read and disposed with the extension

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first). The package has no `test` script; its behaviour is covered by `packages/it/test/design.it.test.ts`.

## Tools

- `design_target` registers a PNG (a file under the project, or base64) as the design of a route at a width. It
  replaces an earlier target of the same route and width.
- `design_diff` captures the live page and compares it with the target. It returns the compact report: `target`,
  `round`, `budgetLeft`, `stage`, `stop`, `score`, `mismatch`, `brief`, `timings`, `counts` (components listed, nodes
  `paired` in the run, `unbuilt` entries, `icons` (the unbuilt entries that are icon slots, see [Layout](#layout)),
  unmatched entries and warnings in the full report, ledger nodes `done` and `regressed`, `drawn` pictures, see
  [Design outline](#design-outline)), `rows` (the first ten items of the stage, in brief order, each with its sentence, stage, design node,
  source and `crop`), `changes` (see [Ledger](#ledger)), `designPath` and `placeholderPath` (see [Design outline](#design-outline)), `xray`,
  `diffImage`, `livePath`, `capturePath`, `sources`, `partial` and
  `hint`. `design_diff({full: true})` returns the full report with every
  component and delta; the store, `design_status` and the x-ray always hold the full one. When the components
  list was cut to `limit`, `hint` reads `showing 12 of 89 paired components, those with deltas first; full: true
  lists every one`, so a short list is not read as the number of pairs. `full: true` lifts the `limit` cut, so the
  full report lists every reported component. `design_diff({section})` takes a section id from
  `design_status.sections` and returns the report of that section only (see [Sections](#sections)); an unknown id is
  an `unknown-section` error naming the known ids.
- `timings` gives the whole milliseconds of one run per phase, 0 for a phase the run skipped, and
  `carried: {pairs, tiles}`, the pairs and 64 px tiles the run reused from the run before (see
  [Live loop](#live-loop)); both are 0 on a run that reused nothing. The result file holds the same timings.

  | Phase        | What it covers                                                                                   |
  | ------------ | ------------------------------------------------------------------------------------------------ |
  | `measure`    | the page call that measures and snapshots the page, bounded by `measureTimeoutMs` 60000          |
  | `decode`     | decoding the snapshot PNG                                                                        |
  | `capture`    | the capture hash and painting the page's masks and dropped nodes over the live raster            |
  | `mask`       | text groups, painting agreeing text over, tile hashes and the pixel compare of the changed tiles |
  | `regions`    | reserved, currently 0                                                                            |
  | `pair`       | the pairer, bounded by `pairBudgetMs` 20000 counted from the moment pairing starts               |
  | `typography` | the type estimate of the paired texts                                                            |
  | `deltas`     | the pair tree, alignment, text verdicts, deltas, provenance, unmatched entries and the score     |
  | `judge`      | stage, brief, rows and stop                                                                      |
  | `encode`     | PNG encoding on the request path                                                                 |
  | `write`      | the pairs, tiles and result files                                                                |
  | `total`      | the whole run                                                                                    |

- A run whose pairing hits `pairBudgetMs` is `partial`: it is not added to the round history, keeps the `round` and
  `budgetLeft` of the run before, reports `stop: null`, and its `hint` says pairing was cut short and the numbers are
  not comparable.
- A `design_diff` whose live capture (the pixels and the decisions) hashes the same as the last round's does not
  advance `round` or spend `budgetLeft`, and leaves the history and the stall priors as they were: it repeats the
  last round's report with fresh `timings` and `hint: the page has not changed since the last diff`.
- A `design_diff` whose measure fails with `page-hidden` (the tab is hidden) or `no-live-widget` (no subscriber
  answered the engine's ping, see `core/src/api/README.md`) is not a run: no result file, no history entry, `round`
  and `budgetLeft` as before. It returns the previous round's report (or run 0's) with `partial: true`, `stop: null`,
  `timings` holding only the elapsed measure, and `hint: the page tab is hidden; bring it to the foreground and run
  design_diff again; <the page error>`, for example `...; design_measure: no widget answered on session "<id>": 1
  hidden, 0 silent`. Until the next diff that measures, `design_status.next` is that same first sentence.
- The type estimate asks the page to render its text samples in chunks of `renderChunk` 24, each call bounded by
  `measureTimeoutMs`; a chunk that fails or times out skips the estimate for its samples and adds a
  `typography-skipped` warning whose `live` is the number of samples skipped, and the run is still reported.
- Run 0, the run `design_target` starts, gives the first `stage` and `brief` and is stored for the x-ray, but it is
  never a prior for `stalled` or `oscillating`: the history starts at the first `design_diff`.
- `stalled` reads the same stage total: the run stalls when, for `stallRounds` rounds in a row under the current
  stage, the capture changed and the total moved by less than the stage's tolerance, and the first brief line says so
  (`stalled: the structure total held at 121 for 2 rounds; 348 items unchanged, first: ...`).
- `oscillating` reads the counted total of the current stage, the stage's entry in `score`, across the rounds. A round
  is a reversal when its total moved the opposite way from the previous round's move by more than the stage's
  tolerance (1 item for structure and content, `geometryPx` for geometry, `colorDeltaE` for paint); the stop needs
  two reversals in a row. A round whose total beats the lowest of the run by more than the stage's tolerance is a new best: it never stops and clears the chain; a tie or a smaller dip is a reversal like any other. Items whose
  value went back to the one of two rounds before are a brief line (`3 items moved back to their round-2 values:
  ...`, the first three by rank), never a stop on their own.
- `design_status` reports the session's current target and its last run, and runs nothing. `score` is the tuple
  `[unpairedShare, structure, content, geometry, paint, residualShare]`, compared left to right, lower is better.
  `round` counts the `design_diff` calls since the image was registered or the last run was accepted. `stop` is
  `done`, `residual-only`, `oscillating`, `stalled`, `budget` or null while the loop goes on. `done` is true when the
  stop is `done`, or when an accepted run exists and the last run's score is not worse than the accepted run's on
  the same capture path. `acceptedRun` names the run accepted from the overlay. While not done the result carries
  `next`, the guide line telling the agent to call `design_diff`; `reregister` is set when the stored target can no
  longer be read. `sections` lists the sections in document order as `{id, kind, line, ledger}`: the node id, its
  kind, its outline line without the `section` prefix, and the ledger counts over its subtree (zeros before the
  first ledger).
- `design_capture`, `design_winner` and `design_clear` capture the page, name the CSS declaration that wins a
  property, and remove targets.

## Layout

The design dictates a layout; a pixel box is metadata on a layout node, never the ask.

- **The layout pass** runs once per registration, after enrichment, and is stored in `model.json`: on the root and on
  every node with children a `layout` with `direction` (`row` when the children sit on one line, `column` when the
  lines stack and share a left, centre or right edge, `grid` when the lines fall on one column lattice, `stack`
  otherwise, and for a single child), `gap` (`{px, uniform}`, the median distance between consecutive children on the
  direction axis), `align` on the cross axis (`start`, `center`, `end`, or `stretch` when the children span it),
  `wrap` (a row whose children continue on a second line of the same lattice), `padding` (the inset from the box to
  the union of its children, per side) and `runs` (the lines of a column or stack that hold several children, each a
  row with its own gap and align). Every node also carries its `index` in reading order and its `size` in the
  parent: `fill` when the children of a row share its width equally, `fit` for text and for a box that hugs its
  text, `fixed` otherwise. Tolerance `layoutTolerance` 4 px, in CSS px whatever the image scale. No pixel is read.
- **Sentences.** An unbuilt entry carries `layout` (its own when it has children, else its parent's direction, its
  index there and its size) and its brief line names the layout, never x, y, width or height: a container with
  some children built is `build a row of 2 cards under ...: equal width, gap 8, align stretch, padding 0 40`; a
  container whose children are all unbuilt is one line for the subtree (`build a column inside ...: "Revenue" (fit),
  "7000" (fit); gap 16`) and its children leave the items until it pairs; a run of unbuilt siblings is one line
  (`build a row of 2 cards under ...`) whose size is the sum of theirs; a leaf is `build the text "Payments" (fit) as
  the 2nd item in the row inside ...`. A px number reaches the brief only in a delta on a paired element, and as
  the position of an `extra` or `offset` entry, which point at a live element.
- **Anchors.** A line never points at a node that has no name of its own (a box with no text inside, an image): a
  run or node whose previous sibling or parent is unnamed, and a leaf whose parent is unnamed or is the page, is
  anchored to the nearest design text above it (smaller `y`, overlapping x range, the closest, glyph runs skipped),
  quoted and cut at 40 characters: `build a row of 3 texts under "financial tools — designed to work…"`. A leaf
  whose ordinal would be above `ordinalLimit` 9 is placed `near` that text instead (`build a box (fixed) near
  "Daybreak Yoga"`), and a built unnamed node is `a box` or `an image`.
- **Icons.** OCR reads icons and glyph-sized marks as text, so registration splits each OCR line before it becomes
  a text node: a leading or trailing run of one or two characters is a glyph when it holds a character outside the
  design's script (above U+024F, General Punctuation excepted, when nine in ten of the design's characters are
  Latin), when it is one character whose ink box is under `iconSide` 24 on both sides, or when the whole line is
  under three characters and read below `iconTextFloor` 0.8. A `%` or a currency sign is never a glyph. A glyph is
  an `image` node on its ink box (the trimmed share of the line box, split by character count) and the rest of the
  line stays text (`血 US bank account` is an image and `US bank account`); a line of nothing but glyphs is one image.
  The box pass makes a segmented box with no text and no box inside it, under `iconSlotSide` 48 on both sides, an
  image too. An image under `iconSlotSide` is an icon slot: `design.txt` writes it as `icon 24x24`, the agent fills
  it at will, it stays `unbuilt` in the ledger and is counted in `counts.icons`, and it never makes a brief line, a
  score weight or a hold on the stage, nor does a container or run made only of icon slots. A live element under
  `iconSlotSide` that pairs nothing and sits inside a paired node's box is not an `extra`.
- **`painted`.** The measure reads each element's `position`, and `sizing: {width, height}` as `fixed` when the
  element's own rule or inline style sets the property to a px length (the same own-declaration read as
  `design_winner`, never the computed px), else `auto`. When the outermost absolutely or fixed positioned elements
  (parent not positioned) are more than `paintedShare` 0.1 of the measured components or more than `paintedCount`
  3, the report carries `painted: {count, total, sources}` (null otherwise; a `Delta` warning has no room for the
  count and the sources, so it sits beside `warnings`), it is never scored, and the brief's first line is
  `painted: <count> elements are absolutely positioned; lay the page out with flow, flex or grid and let the browser
  place them`.
- **`sizing`.** A paired element whose design node is `fill` or `fit` and whose live `sizing.width` is `fixed` gets
  one `sizing` delta in the geometry stage (`live: fixed`, `target: fill | fit`), briefed as the rule: `let the
  article fill the row (flex: 1); it is sized 400 px`, or `let the button fit its content; it is sized 112 px`.

## Pairing

The vote pairer scores every design node against every compatible live element and takes the best pair first.

- A text node takes an element only when the centre of the node's box lies inside the element's box grown by
  `tileMargin`. The test runs on every claim once geometry is trusted, and on every claim after the first while it
  is not, so an OCR line 1 px outside its element, or one straddling two elements, still pairs.
- A voter's weight is its base times how often it agrees with the base-weight consensus, counted only over design
  nodes whose consensus top score is at least `pairFloor`.
- A text node whose text voter and structure voter both abstain (a single glyph under 14 px whose parent is not
  paired) is refused: kind, style, geometry and pixel alone never pair it. An unpaired glyph is `unbuilt` with
  `stage: null`, outside the score.

## Sample data

Before a live text is compared with its design text both are folded through `CONFUSABLES` (`›` and `>`, dashes,
curly quotes, `…`, `×`, bullets) and a lone leading or trailing glyph outside the Latin script is dropped, so
`Contact sales ›` against `Contact sales >` is no text delta; the sentences keep the raw texts.

A text verdict of `sample-data` (a literal in the source whose design text has the `data` or `placeholder` role)
becomes a warning only when the paired element sits in a container that renders at least one sibling from an
expression: provenance reads each sibling's JSX and a sibling whose text has no literal (`expression` or `mixed`)
counts. A `placeholder` design text (`[Customer Name]`) is a mark on its own and warns without the sibling. A page
whose copy is all literals gets no `replace the hard-coded sample` line.

## Live loop

Every save already starts a run: an `hmr-update` from the bundler, `runDebounceMs` 150, the `page_hmr` settle, then a
run with `observe: false`. A run after an edit reuses what the edit did not touch, keyed by content hashes, so a carry
changes the time of a run, never its answer.

- **Touched files.** Each target's run lane keeps the files of every `hmr-update` since its last run started, relative
  to the project; a run takes the set and clears it. A run with no `hmr-update` since the run before (an agent
  `design_diff`, an x-ray capture, a decision) gets `touched: all` and reuses nothing.
- **Pairs.** Each entry of `pairs-<run>.json` carries the live element's `fingerprint`: `source`, `key` (the
  `data-conciv-key` the compiler stamps next to `data-conciv-source`: a hash of the file, the enclosing function, the
  element name, its static class and its static text, with an ordinal among equal hashes in the file), `owner` (the
  component path from the root, `Stripe[0] > Card[2] > h3[0]` from the React fiber chain, null when the framework is
  unknown), `tag`, `textHash` (fnv of the folded element text) and `box`. The source line is an address for reading
  the site; the key is the element's identity, so an edit that shifts lines changes no key. A pair of the run before is
  carried when its design node is still in the model and a live element has the same key, or else the same owner path
  (JSX moved to another file or into an extracted component), with the same text hash and a box within `tileMargin`;
  copies with one key and one text go to the nearest box. Without a key on either side, a live element must sit at the
  same source (or the same path when it has none) with the same tag and text hash and a box within `tileMargin`,
  whatever file the edit touched: the fingerprint is the proof that the element did
  not change, so on a one-file page an edit that moves nothing else carries everything else. The touched files only
  order the scan, candidates under them first. Pins are applied first, then the carried
  pairs seed the pairer's state as a greedy take would and the greedy loop pairs the rest. The voters are calibrated
  and the pool medians taken over every node and element, as in a full run: calibrating over what the carry left
  paired 93 nodes on the stripe page where a full run pairs 92, and a carry must not change the answer. An entry without a fingerprint carries nothing.
- **Tiles.** The page is cut into tiles of `tileSide` 64 px, and each tile is hashed over the masked live pixels it
  reads (the tile grown by the blur radius plus 2 px for the antialiasing check). `tiles-<run>.json` holds the grid
  and, per tile, its hash, its mismatch share and, when any pixel differs, its mask bits packed in base64; masks are
  stored rather than recomputed because the unchanged tiles' mask feeds `mismatchAt`, the residual and the diff
  image, and recomputing it is the blur and compare the cache skips. Tiles whose hash matches the run before take
  its mask; the changed tiles are blurred and compared on their union grown by one tile, so the region finder and
  every per-box `mismatch` give the numbers a full compare gives. A first run, or a page of another size, computes
  every tile.
- **The agent's diff after a save.** A `design_diff` with no `hmr-update` since the last run, when that run was an
  `observe: false` run whose capture hash (the pixels and the decisions) equals the page now, captures once and
  counts that run as the round: it is judged against the round history, its `components` are listed again for the
  agent's `limit`, `depth` and `full`, its result file is rewritten with the new `round`, and its `timings` are the
  settled run's. A diff whose capture equals the last round's repeats that round, as above.

## Ledger

- **The ledger.** `ledger.json` sits next to `model.json` and holds one row per design node across runs: `status`,
  `since` (the run the status was reached in), `pair` (the last known live pairing: `path`, `fingerprint`,
  `confidence` and the `run` that confirmed it, kept after the element is gone until a new pair replaces it) and
  `item` (the node's worst current item: `stage`, `size`, `sentence`). The ledger is written when a run becomes a
  round, by `design_diff` or when a settled run is promoted to the round; a save between rounds measures against the
  last round's ledger and writes nothing. A repeated round, an unanswered page and a `partial` run
  leave it as it was. A target without the file starts with every node `unbuilt`. Nodes excluded or marked as an image
  slot keep the row they had.
- **Statuses.** `done` when the node is paired and no item names it; `paired` when it is paired with at least one item;
  `unbuilt` while it was never paired; `regressed` when a node that was paired, `done` or `accepted` has an item again
  or lost its pair, until the first run that measures it clean, which makes it `done`. `accepted` holds while an
  `accept-node` decision exists for the node, whatever the run measures; the x-ray sets it next to Pin (`Accept node`)
  and revokes it with the same button. `design_status.ledger` and the full report's `ledger` count the nodes per
  status, and the compact report's `counts` carries `done` and `regressed`.
- **Changes.** `changes` compares the ledger before the run with the ledger after it: `done` (newly clean), `regressed`
  (newly dirty or unpaired), `paired` (paired for the first time), `lost` (the node has no pair in the run and the
  element it was paired to in the run before is not found by the fingerprint rule of the carry) and `moved` (the run's
  pair box, or for an unpaired node the element still found, lies outside `tileMargin` of the stored one). A node
  paired in the run is never `lost`, and a node that stays clean is `done` whichever element it pairs; its stored
  fingerprint, line included, is the run's. Each entry is `{node, sentence, crop}`; accepted nodes are
  never listed. When a ledger existed before the run, the first brief line is the summary, `since round 2: 12
  done, 3 regressed ("Daybreak Yoga" lost its element), 5 paired` (second, after the `stalled` line, when the run
  stalled), and the stage's items of regressed nodes rank first.
  `design_status.changes` holds the latest run's changes.
- **Crops.** `GET …/xray/node?target=<id>&node=<node>[&run=<run>]` answers a PNG encoded on request: the design crop
  and the live crop of the node, side by side with a 4 px gap, each the node's design box grown by `tileMargin` on
  every side in CSS px, the live one placed at the element the run paired (from `pairs-<run>.json`, the latest run by
  default). A node the run did not pair gets the design crop alone. Every change and every row with a node carries its
  `crop` url; `diffImage` stays for the whole page.
- **Carry order.** On a run after an edit the pairer takes pins first, then the ledger's pair per node, in the order
  the run before took its pairs, then the pairs of the run before the ledger does not hold, each only when its
  fingerprint still finds its element, then the greedy loop. The ledger carries only the pairs the run that wrote it
  confirmed: a dead pair seeded before the greedy loop changes what the loop takes for the other nodes, so a page
  moved and moved back would not score as it did the first time. A dead fingerprint stays in the ledger for `lost`
  and its node goes back to the greedy loop. A run with nothing touched since the run before carries nothing.

## Design outline

Registration writes `design.txt` next to `model.json`, and a run that estimates type rewrites it: the design tree as
an indented outline in document order (layout index, then top, then left), one line per node under a `page WxH` line
for the root, children indented two spaces under their `within`. A text reads `text "Access borderless" size 56/700 data`
(the folded text, size/weight once the type estimate knows them, the role when it is not `unknown`); before the
estimate it reads `size ~56`, the ink height over `capRatio` (calibrated on the stripe fixture), the tilde marking a
size read from the ink alone; a box reads
`box 1280x72 row gap 29 align center padding 0 48, background #fff, border 1 #e3e8ee, radius 8` (its size in CSS px,
the layout from the layout pass, its paint); an image slot reads `image 480x320 placeholder`, and one under
`iconSlotSide` on both sides reads `icon 24x24 placeholder`. The model holds no text colour, so
no colour is written. The same model gives the same file. The compact report and `design_status` carry `designPath`,
`design_diff({full: true})` carries the lines as `design`, `design_status.next` at round 0 reads `read <designPath>
for the whole design before building; the brief lists what to fix first; copy <placeholderPath> into the page's
source and use <Placeholder kind=…> for every image and icon line`, and the x-ray shows the outline under the brief.

- **Placeholders.** An image adapter cannot hand over a picture, so registration writes `placeholder.tsx` next to
  `design.txt`: a `Placeholder` component with props `kind` (`icon`, `logo`, `image` or `avatar`), an optional
  `label` and an optional `ratio` (the `aspect-ratio` when the parent has no height). It fills its parent, is
  `aria-hidden`, and draws a rounded two-tone fill whose hues come from an FNV hash of `label` (or `kind`) with a
  small centred glyph per kind, in CSS only. The file is written for React at registration and rewritten for Solid
  on the first run whose measure reports a Solid page (sourced elements and vite dev ids, no React fiber). The compact
  report and `design_status` carry its path as `placeholderPath`, and `DESIGN_GUIDE` tells the agent never to draw
  an icon, logo or illustration.
- **Drawn pictures.** The measure marks a component `drawn` when it is an `<svg>` with a path, polygon or circle
  inside, an `<img>` whose `src` is a `data:` url, or a `<canvas>`. A drawn component that pairs with an image node,
  or whose box lies inside one, raises one `svg-drawn` warning (`svg (src/Landing.tsx:120): drawn svg; replace it
  with <Placeholder kind="icon" />`, `icon` when the slot is under `iconSlotSide`, else `image`), counted as
  `counts.drawn`. Warnings lead the brief, before the stage items. Every image node and icon slot is painted with the
  design's pixels in the compare, so neither a placeholder nor a drawing costs mismatch; the warning is the only cost.
- **Gradients.** The paint pass reads a box's interior, inset by `geometryPx` and its radius and with its children
  cut out, as row means and column means. When the first and last mean differ by more than `colorDeltaE` along
  exactly one axis and every neighbouring pair of means on it is within `colorDeltaE`, the box has
  `paint.gradient: {from, to, axis}` and the outline reads `background gradient #635bff to #00d4ff vertical`. A
  childless box whose fill varies along both axes, or unevenly, is a picture and becomes an image node. The measure
  reads the first and last stop of the first `linear-gradient` in `background-image`; a live gradient whose ends
  differ from the design's by more than `colorDeltaE`, or a solid fill against a design gradient, is one `background`
  delta naming both ends, and a live gradient against a solid design compares its first stop.

## Sections

A section is a top-level node of the design tree: a node whose `within` is unset or names no node, a child of the
root. The `regions` enricher, run after `color` and before the layout pass, groups the root's text and box children
into regions by whitespace: a horizontal band of free space that no child crosses is a cut when it is at least
`sectionGap` (64 css px) tall at the top level and `regionGap` (32 css px) inside a region, and the children between
two cuts form a region. A text alone between cuts joins the neighbouring group with the smaller gap to it; a painted box
alone between cuts stands as its own section. Inside each region the cut is made again with vertical bands, then
horizontal once more, to a depth of three; a cut that leaves one group is no cut. Pictures take no part in the cuts:
afterwards each top-level image joins the region it overlaps most, or the nearest one by edge distance when it overlaps
none. A region is a box with no paint, its box the union of its text and box members, and its members' `within` set to
it; a node that already has a `within` keeps it. Its outline line starts with `section <id>` (the node id) before the node line, as in
`section 4f1c2a7e box 1280x72 row gap 29 align center`; a node no region took is its own section, and nested lines
carry no prefix. A section is a view, not a run: `design_diff({section})` runs the whole page as always (store, round,
budget, history and ledger are untouched by the scope), then filters the report to the section's subtree, the nodes
reachable through `within` from the section id. `items`, `rows`, `unmatched`, `changes` and `ledger` keep the subtree's
nodes; an item, entry or warning with no node is kept when its box lies inside the section's box, and a component when
it is paired to a subtree node or lies inside that box. `brief`, `stage`, `score` and `rows` are judged again over the
kept items with no round history, and `stop` is `done` when no kept item is above tolerance and pairing was not cut short, else null; `stalled` and
`oscillating` read the rounds, so they stay whole-page, in `page: {stop, stage, score}`. The report echoes `section:
{id, line}` and `scope: section`. Several agents can each build one section against the same target; splitting the
page and writing its skeleton first is the harness's business.

## Sources

Each delta names the source that measured it, and each report lists the sources of its run.

- `dom`: the live document in the app tab. Used when the tab width equals the design width.
- `mirror`: a scriptless snapshot of the live document, rebuilt in an off-screen iframe at the design width. Used
  for every box, style and pixel when the tab width differs, so the tab is never resized. Its pixels are taken with
  snapdom (`capturePath: snapdom-mirror`).
- `takumi`: the same snapshot laid out by takumi in wasm, when the page's fonts are fetchable web fonts and its
  styles stay inside takumi's subset. The value is stored as the delta's `opinion` and shown in the overlay beside
  the mirror's; it never changes a count, the score or the stop.

## Trials

`docs/designs/trials/` holds one record per trial: the rounds an agent ran against a design image, with the brief,
the score and the edit of every round, and where the loop misled it. Run one from `packages/it` with
`pnpm trial --route '/?variant=<name>' --width <px> --image <png> [--agent] [--blind]`, then type `diff`, `status`,
`pin <node> <path>`, `mark <kind> <node> [value]`, `accept`, `screenshot <file>` or `quit`; `--agent` boots the real
harness (`claude` on PATH, or `CONCIV_HARNESS_BIN`) instead of a stub, `--blind` sets the design extension's `blind`
option so the agent's `design_diff` results carry no `livePath`, `diffImage` or `capturePath` and its design guide
forbids opening a png or taking a screenshot, and `pnpm trial --render <dir>` writes the
fixture's design images.

## How text is compared

Every renderer rasterizes glyphs differently, so identical text differs pixel by pixel between a designer's export and
the developer's browser. The extension compares text as text and keeps it out of the pixel comparison only when both
sides agree on it.

1. **Foreground color from glyph ink.** The `foreground` delta samples the ink inside a component's glyph boxes, not
   the anti-aliased edges of its tile: the median color of the pixels within `colorDeltaE` of the pixel farthest from
   the background, so blended edges and subpixel color fringes do not count. A component paints text, and is compared
   on `foreground`, when it captured glyphs. A component with no ink reports no foreground.
2. **Live text.** Each captured component carries its glyphs: one entry per text node it paints (stopping at nested
   components), with one box per line, rounded out to whole pixels and grown by `glyphHalo`. An empty `input` or
   `textarea` with a placeholder contributes the placeholder as a glyph whose box is the field's padding box.
3. **Target text.** `design_target` reads the image once with OCR and stores each run as a `text` node under the
   target root, its box trimmed to the ink inside it. The result carries `text: {runs}`, or `text: {runs: 0, error}`
   when the reader fails; the target is stored either way.
4. **Groups.** On each diff, live glyphs and target runs whose boxes overlap by more than half the smaller box are
   joined into groups, across component boundaries. A group needs both sides. Each side's strings are joined in
   reading order, case folded and stripped of whitespace. A group's text agrees when the strings are equal and the
   ink-trimmed box unions agree edge for edge within `geometryPx`. Ink color is checked per component in the group:
   the live ink inside its trimmed glyph boxes against the target ink inside the same glyph boxes, within
   `colorDeltaE`, each against the median background of the boxes' union grown by `tileMargin`.
5. **Masking.** Before the matcher runs, each component whose text and ink agree contributes its ink-trimmed glyph
   boxes, and the parts of the target boxes within `geometryPx` of them. These boxes, grown by `glyphHalo` plus
   `blurRadius`, are painted with the target's pixels on a copy of the live capture. A placeholder is masked by its
   ink, never by its field box, so a changed border or background of the field stays in the diff. Everything else compares as before. The
   original capture is kept for color sampling, unmatched regions and the stored run image; the diff image is drawn on
   the masked copy.
6. **Text delta.** A gated component that owns a group whose strings differ carries a `text` delta with the live and
   the target string. When one OCR run spans several components, their strings are found in the run as whole words
   left to right; the first component whose string is missing owns the delta, and its target string is the rest of
   the run. Its provenance is the component's own source location (`via: 'source'`).
7. **Status** is unchanged: no component above tolerance and nothing unmatched.

A target registered before text runs existed has no runs: nothing is grouped or masked, and diffs behave as they did.
Registering it again reads its text.

## OCR engine

PaddleOCR PP-OCRv6 tiny (detection and recognition) through `ppu-paddle-ocr`, with ONNX inference on
`onnxruntime-web` (WebAssembly) on one thread. The models are vendored under `models/` (Apache-2.0, see
`models/README.md`) and passed as buffers, so nothing is downloaded at runtime and no telemetry is written. The
remaining native code is the `@napi-rs/canvas` prebuilt that `ppu-ocv` uses for image decoding.

`ppu-paddle-ocr` has no Node WebAssembly entry, so the reader imports five of its internal modules by file URL and
builds the service on `onnxruntime-web`. For that reason `ppu-paddle-ocr` 6.6.1, `ppu-ocv` 4.0.0 and
`onnxruntime-web` 1.31.1 are pinned exactly: a release could move the imported files, and the integration test that
asserts runs after registration is what catches it.

The service is created once per process, reads are serialized, and it is disposed with the extension. A read takes
a few hundred milliseconds per 1280x720 image once warm, and happens once per registration.

pnpm 11 fails an install on any dependency build script it was not told about, and `onnxruntime-web` depends on
`protobufjs`, whose postinstall only prints a version warning. Add `allowBuilds: {protobufjs: false}` to your
`pnpm-workspace.yaml` (or `ignoredBuiltDependencies: [protobufjs]` on older pnpm).

## Constants

All in `src/shared/tolerances.ts`.

| name               | value | role                                                                              |
| ------------------ | ----- | --------------------------------------------------------------------------------- |
| `glyphHalo`        | 1     | pixels a live glyph box grows by                                                  |
| `inkTrimThreshold` | 40    | per-channel distance from a box's top-left pixel that counts as ink when trimming |
| `geometryPx`       | 2     | edge distance allowed between a group's trimmed live and target box unions        |
| `colorDeltaE`      | 3     | ink color agreement and ink mask threshold                                        |
| `tileMargin`       | 8     | growth of the trimmed union whose median is the ink background                    |
| `tileSide`         | 64    | side of the pixel tiles the compare caches across runs                            |
| `blurRadius`       | 1     | added to `glyphHalo` when painting over agreeing boxes                            |
| `iconSide`         | 24    | a one-character OCR run whose ink is under this on both sides is an icon          |
| `iconTextFloor`    | 0.8   | an OCR line under three characters read below this confidence is an icon          |
| `iconSlotSide`     | 48    | an image node under this on both sides is an icon slot that never holds a stage   |

## Blind spots

- Figma node targets are not supported; targets are images.
- A text change inside a component whose pixels stay below `tileGate`, or under a parent the matcher does not
  descend into, produces no `text` delta.
- A row shifted by more than half a line forms no group; it stays in the pixels and the geometry deltas report it.
- Position agreement is checked per group, not per component: one OCR box spanning several labels cannot be split, so
  a label moved inside a run whose union stays within `geometryPx` is masked.
- Weight, italic, decoration or letter-spacing changes with the same string, ink color and place are masked.
- Tall images (above about 2000px) lose OCR recall on small text; missed runs stay in the pixels.
- 2x exports are downscaled nearest-neighbour by the adapter and are not separately measured.
- Icon fonts, rotated text and text over photographs are not read; they stay in the pixels.

## Known false positives

- **OCR misreads** on low-contrast or substituted fonts surface as a `text` delta showing both strings.
- **Reading order** on unusual inline wrapping (floats, bidi text) can join words in another order, giving a `text`
  delta whose strings hold the same words.
- **Truncated text** (`text-overflow: ellipsis`): the DOM string is longer than the painted one.
- **Hyphenation** and soft hyphens: a hyphen read at a line end is not in the DOM string.
