# @conciv/extension-design

Internal to `@conciv/it`. The design extension holds a design (a Figma frame, or an image) per session, returns it to
the agent as a tagged node tree with the rules to build it by, measures the live page against it node by node through
a stored mapping, and says when the page is done.

## Overview

Three tools for the page builder: `design_get` returns the design, `design_check` measures the page and lists what to
fix with the verdict, and `design_status` reads the last check without measuring. Everything they say is said by mapping: a row names a design node and the
conciv key of the element that renders it. The root exports pick a browser condition (dist/client.js) or an import
condition (dist/server.js), with subpaths ./client, ./server and ./defs. The `build` script runs tsdown, vite build
(client), then tsc declaration emit. The package ships no CSS: the widget's Uno scan covers these sources and the
x-ray overlay adopts the widget's stylesheet (`uno.config.ts` here only feeds the lint).

## Source tree

```text
src/
  client.tsx           widget entry: the measure tool (the mirror, or the live document when the widget is the design), the composer
                       button and the Surface that mounts the x-ray overlay on the page
  client/
    takumi.ts          the takumi second opinion over the mirror
  server.ts            extension entry: storages, store, adapters, measurer, voter, runner, differ, x-ray routes
  shared/
    defs.ts            tool definitions, wire schemas, errors, the domain types and stage interfaces
    tolerances.ts      designConfig, tolerances, attributes, property aliases, colour helpers
    tree.ts            walk over any tree
    box.ts             box geometry
  server/
    store.ts           the target store over the runs store; snapshots are artifact files with a catalog row
    runs/              the runs store: tables, views, sources, the session runs, artifacts and the commands
    differ.ts          the three tool bodies: register or return the design, quiet then run and judge, last round
    tools.ts           the server tool bindings
    document.ts        the design tree as tagged nodes plus rules
    runner.ts          one check: measure every width, again when an edit landed meanwhile, then map, gate, write
    progress.ts        rows closed, opened and kept, nodes gained and lost, the changed regions of the screenshot and their ids
    mapping.ts         declared, stored and voted mapping entries
    renderers.ts       the elements that render a node: data-figma first, else the mapped keys
    gate.ts            the gate rows and their magnitude words, coverage and counts
    reflow.ts          sticks out, sideways scroll, overlaps and the reflow tag verdicts at one width
    drift.ts           the page row for boxes that sit more than 4 px off their frame position, and where the drift grows
    verdict.ts         done, stalled or not yet with reasons
    measure.ts         the measurer: asks the widget's measure tool at a width and height
    raster.ts          pixel and box operations, compare and diff painting
    xray-routes.ts     the x-ray RPC (hotkeys, targets, current, rounds, layers, label) and its image and wasm routes
    pairers/           the voter: the calibrated vote that proposes a key for an unmapped node
    sources/
      figma.ts         createFigmaAdapter: link parsing, REST or pasted document, the collapse rule, the one tree
      figma-schema.ts  the Figma REST schemas
      figma-facts.ts   the Figma fields a node carries to design_get
      structure.ts     implied groups (w:) and layers (l:), and the gate facts of every node
      reflow-tags.ts   stack, wrap and scroll tags
      image.ts         createImageAdapter: OCR, segmentation, roles, regions
  xray/
    state.ts           the overlay's toggles, picked id, round, width and Esc cascade, one store
    data.ts            the stored design, rounds and layers over the x-ray RPC, polled while on
    view.ts            the views over that data: widths, rows at the shown width, ids with their rows
    overlay.tsx        the host element on document.body, its shadow root and the hotkeys
    rail.tsx           the icon rail: on, pick, layers, magnitudes, panel
    boxes.tsx          the ids drawn on the page: DOM boxes by magnitude, Figma boxes dashed, changed regions
    column.tsx         the content column: states, sliders, counts, rows and the round's images
    card.tsx           the picked id: FOM, DOM, CSSOM and SRC, its rows, and the right and wrong pair labels
    three-d.tsx        the planes SRC, CSSOM, DOM and FOM in perspective, row lines across, focus and orbit
```

## Tools

- `design_get({figma})`, or `{figma, document, image}` with the pasted REST nodes document and the PNG, or `{image}`
  for a PNG design. The first call registers the design as the session's target (id from the file key, node id and
  document version); a later call with the same link, or with no link, returns the stored design. It returns
  `{target, root, count, viewport, rules, nodes}`. `nodes` walk the tree in order, each with `id, type, name, within,
  depth, box` (exact, frame-relative) and the Figma fields it has (`fills, strokes, radius, text, font, layout,
  sizing, layoutAlign, constraints, clips, image, crop, absolute`), `implied: true` on a group the layout implies,
  `reflow: {kind: stack | wrap | scroll, minChildWidth}` and `key` once the mapping holds the node. `count` leaves
  implied nodes out. `rules` are the sentences the page must follow. A stroke comes with `strokeWeight`,
  `strokeAlign` (INSIDE, CENTER or OUTSIDE) and, when Figma strokes only some sides, `individualStrokeWeights`; a
  border row then names the sides and fails a box stroked on other sides; the rules ask for it as an outline inset by its weight, which takes no
  space, and the measure reads a border, an outline or an inset box-shadow with no blur as the stroke, each on the
  sides it draws. A border row names the
  align after the expected stroke. An empty input or textarea measures its placeholder as its text, in the
  `::placeholder` colour (not the colour of typed text), so a real form control pairs with the design text it stands for. An asset node passes when its element shows that file, or shows
  any image or paints a CSS shape (a fill, border or gradient) and its capture matches the asset by pixels; an element that paints
  nothing fails as a wrong image. A Figma line cropped from the frame render takes its stroke weight, so a 1px line drawn as a 1px box
  matches it.
- A run builds one page, so its targets share one route. `design_get` takes `route`, the path of that page (`/pricing`,
  with a query when the page needs one), and moves every target of the run there, the frames of that call and the
  frames registered before it; without it a new target takes the pathname the tab is on when the design is registered.
  A later `design_get` with another `route`, with one link or several, moves every target again. Each `design_check`
  measures the target's route: when the tab is on another one, it opens the tab there first (through the client tool
  `design_route`) and waits until the tab reports that route. A route without a query matches the tab's pathname whatever its query; a route with
  one matches the pathname and the query. A target with no route is measured where the tab is. A check that finds no
  design node says which route it measured, and so does a check that is not done while more design nodes are missing
  than rendered, in its first reason after the page rows. Only for a target with no route do they add that
  `design_get` with `route` points the target at another page; a target with a route was measured on its own page.
- `design_check({nodes?})` waits for the last save to settle, measures the page at the design width and every reflow
  width before it writes anything, and measures them all again (up to 3 times) when an edit reached the dev server while
  it measured, so a reply never mixes the page from before an edit with the page after it. It then updates the
  mapping, and returns `{round, rows, reflow, coverage, counts, verdict, reasons}`. A row is `{node, key, kind, name, text, magnitude, property, expected, actual, delta}`;
  rows at `slightly` are counted, not listed. When the CSS rule that wins a row's property sits inside an `@media` rule
  (nested ones included), the row text ends with `set by @media (...)`; the measure returns that condition per CSS
  property in `styles.media`. `@container` rules are not read. `reflow` holds one entry per width: the design width, each
  width a `@media` rule on the page names (top level, in `@layer` or nested inside a style rule) and the width under it (read from the frame's own document, so the mirror
  frame's rules count too), and the reflow tags' breakpoints: `rootHeight,
  sticksOut, overflowX, overlaps, tags` with `ok` and `why`. A box (not a text) that sits more than 4 px lower or higher
  on the page than in the frame, measured from the frame's top, gives one page row that blocks done: each element may be
  within tolerance of its parent while the offsets add up down the page (a Figma line takes no space, a 1px element
  does). The row names the box that drifted most and the siblings below which the drift grows. A page error, or a page that renders under half the nodes
  of the last settled round, answers `{unsettled: true, rendered, route, verdict: 'unsettled', reasons}`; its round is recorded with state
  `unsettled` and is never judged.
  An error the page throws answers `broken` with `thrown`, except the browser's `ResizeObserver loop completed with
  undelivered notifications.`, which an observer that changes layout in its own callback raises and which is benign.
  Under half is decided after every stored pin is voted again: a restructured page is measured on a fresh vote, not
  on pins that point at elements it no longer has.
  The target counts unsettled checks in a row; from the second, the reply also carries `round, rows, reflow, coverage,
  counts` over what did render, a reason saying the page renders N of M nodes with the rest in `coverage.missing` (and by name in `coverage.gone`), and
  a round is written with verdict `unsettled` (its mapping is not kept). A settled check resets the count. The
  verdict is judged on the round the check wrote: `done` when `much + noticeably + pins = 0`, every required node renders
  (decorations, zero-size nodes and wrappers that draw nothing, a box with children and no fill or stroke whose children
  are checked on their own, are not required, except a Figma line: it is drawn by its stroke, and it renders
  when an element pairs with it (the pairer gives a line its stroke weight as thickness, so a 1px element or an `<hr>`
  pairs), or when the element paired with its frame or with a sibling whose edge it lies on shows a border on that side,
  whatever its other sides),
  nothing sticks out, nothing scrolls sideways and every reflow
  tag holds at 1024 and 768; `stalled` when `much` is above 0 and has not fallen for two rounds; else `not yet`. The
  reasons say which condition failed with the numbers. Pixels are reported, never judged. Each round also stores `progress`, which the replies leave
  out unless the config's `show` lists `progress`. It is null on round 1;
  after it, it compares with the round before: rows `closed`, `opened` and `kept` (with `repeat`), nodes `gained` and
  `lost`, pixel share `now` and `before`, and `changed`: the share of screenshot pixels that changed (anti-aliasing left
  out) and the changed regions (tiles of 8 px joined across 2 empty tiles, under 4 px a side or 24 px² dropped, only the
  12 largest are listed, `count` says how many changed), each with the three ids whose boxes overlap it most. Captures are frozen first: animations paused
  and rewound, transitions off. `note` says so when the edits changed no pixels at the design width, the reflow rows are
  the same as the round before, and rows are kept.
- `design_status()` measures nothing: it returns `{verdict, reasons, round, counts, coverage, rows}` (and `progress` when shown) of the last stored
  round, or `not yet` with round 0 when no check has run.

## Mapping

Stored per target as `{figma: {fileKey, nodeId}, conciv, source: declared | voted, round}[]`. Each check: an element
with `data-figma="<id>"` and a conciv key declares its node and replaces what was stored for it; a stored entry stays
otherwise, and a node whose element left the page reads as not rendered; only nodes nobody mapped go to the voter.

## Gate

Each node with gate facts (every node of the structure pass; for an image design, every node with its tree parent)
is measured through its first renderer. A container (a node with flow children, a group or a layer) pinned with a
px width or height, a text with a px size, a box narrower or wider than the design (beyond 20% for a leaf, 8% for a
container, or 24 px on a container), shorter or taller (7% more slack), a flex direction against a group's
direction, and a box more than 12 px off its parent's offset make a row. Size rows read `slightly` under 8 px or under
15% and 32 px, `noticeably` under 40% and 96 px, else `much`; position rows `slightly` under 12 px, `noticeably`
under 32 px, else `much`.

## Runs

Every design session is recorded in one store, `<conciv home>/runs.db`, migrated whenever it is opened. A project's
`.conciv` keeps no design tables.

- A run is one agent conversation, and it never closes: a conversation has no end the engine can see (an
  interactive Claude session stays open for days, `claude --resume` revives the same id). A tool call carries the
  harness session id of the agent that made it (for Claude, `CLAUDE_CODE_SESSION_ID`, sent by the plugin bridge and by
  `.conciv/bin/conciv`); a call without one (the widget chat) is keyed on its tab session. The first `design_get` or
  `design_check` of a conversation opens a run with `harness_session_id` and its provenance: `session` (the tab),
  `model` (the tab's model for a widget chat run), `harness`, `agent_id`, `project_key`, `branch`, `head`, and the tools
  head, version and fingerprint. Another conversation on the same tab opens its own run, and so does a conversation
  that comes back after another one took the tab, or after the engine restarted (the tab's current run is always its
  newest, which the store relies on to find a target's rows). Its targets, rounds, rows and tool calls are written
  there as they happen. A target registered in an earlier run is copied into the new run the first time the store
  reads it, with its frame and design but no rounds, so a check in a new run starts at round 1 and compares with
  nothing from the run before.
- Every per-run table carries `run` and `session`; per-check tables also `target`, `round` and, where it applies,
  `width`, so `--where 'session == "..."'` works on every source.
- Every check writes a round with a `state`: `measured`, `unsettled` (the page rendered too little and the check
  replied unsettled), `unchanged` (with `same_as`, the round it equals, and nothing else copied) or `broken`. `check`
  counts every check of a target; `round` is the number the replies show, set on measured and broken rounds only and
  null on unsettled and unchanged checks. Image mismatch shares are the round's `image_mismatch`, by node.
- Rows keep `property`, `expected` and `actual` (design and page value, with unit) and `delta` (null when not numeric);
  rows graded `slightly` are stored too, `coverage.gone` names are `missing` rows of kind `gone`. The replies of
  `design_check` and `design_status` carry `property`, `expected`, `actual` and `delta` on every row they list.
- `design_get` writes the hints it tells as `hints` rows at round 0; `hint_vs_drawn` reads them.
- A tool call row carries its round: for `design_check` the round it wrote (the highest across widths, null when it
  wrote none) and the `check` it recorded, for the other tools the run's latest round when the call ended.
- Snapshots are files under `<home>/artifacts/<run>/<target>/<check>/<width>/<kind>.<ext>`, one `artifacts` row each
  (`id, run, session, target, check, round, width, kind, path, content_type, size, checksum, written`, `path`
  relative to the home; the lazy `content` field reads the file, so `--select 'content'` returns a JSON snapshot): per check and per
  measured width `screenshot`, `dom`, `cssom` (with the widths the page's queries name) and `fom`, plus `diff` and
  `mask` at the frame width; per target under `<home>/artifacts/<run>/<target>/` the `frame` image, the `design` tree and the raw
  `figma` document. Nothing expires.
- Every `design_get`, `design_check` and `design_status` refreshes the run's derived fields: `last_at` (the time of
  that call), `verdict` (the verdict of its last measured or broken round; `done` is the run's done) and `model`,
  `usage` and `cost` from the conversation's transcript (`server.sessions.transcript`, for Claude
  `history.transcriptUsage` in `@conciv/harness`, which looks the id up in the project's transcript folder, then in
  every project folder; a widget chat run reads the transcript its tab's session row names). `model` is the
  transcript's model of most assistant messages; `usage` is their summed usage; `cost` is the summed `total_cost_usd`
  of the transcript's result records, null when it has none. A run whose transcript is not found keeps them as they
  were and gets `error_code` `no-transcript`. Harnesses other than Claude read no transcript usage.

Queries: `conciv db query --from design_run_summary` (one row per run and target, with `last_at`, `model` and
`harness` to filter by, as in `--where 'run_verdict == "done"'`; a run with no target or no round still has a row, its
`round`, `verdict` and `rows` null); every stored table is `design_stored_<table>`.

A run row is corrected with the house write: `conciv db write --into design_runs --values '{"run": 182, "model":
"claude-sonnet-5-5", "cost": 3.01}'`. `run` must exist; only `model`, `usage` (a `TokenUsage`), `cost`,
`harness_session_id`, `verdict`, `error` and `error_code` can be set, and only the columns named change.

## Sources

Each delta names the source that measured it.

- `dom`: the live document in the app tab. Used only when the widget itself is the design (`widget: 'shown'`). Its
  pixels are taken with snapdom (`capturePath: snapdom-live`) from the computed styles alone: the page's `<style>`
  and `<link>` elements stay out of the clone, as in the mirror, so an authored `1fr` track never re-sizes against
  the widths snapdom froze on its items.
- `mirror`: the tab's route loaded again in an off-screen iframe the tool owns (`data-conciv-capture`, so the widget
  stays out), sized to the design width. The first measure of a check loads it fresh, so the page is what its current
  code renders, not what the user scrolled, opened or typed in the tab, and the tab is never resized. Used for every
  box, style and pixel unless the widget is the design. Its pixels are taken with snapdom
  (`capturePath: snapdom-mirror`).
- `takumi`: the mirror's document laid out by takumi in wasm, when the page's fonts are fetchable web fonts and its
  styles stay inside takumi's subset. The value is stored as the delta's `opinion` and shown in the overlay beside
  the mirror's; it never changes a count, the score or the stop.

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
