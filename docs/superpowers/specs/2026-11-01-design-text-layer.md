# Design extension: text compared as text

- **Author:** omridevk
- **Status:** Draft (third revision, after two EGM review rounds)
- **Date:** 2026-11-01

---

## Overview

The design extension (`packages/extensions/design`) holds a target image per route and width, captures the live page at that width, and returns ranked component deltas with style provenance. It compares the page pixel by pixel. Text breaks pixel comparison: every renderer rasterizes glyphs differently, so identical text produces pixel differences large enough to trip `tileGate`.

This design does three things, in order of weight:

1. Fixes the foreground color estimator, which samples anti-aliased edge pixels and so reports a blended color on every renderer. This needs no text layer and ships first.
2. Masks, out of the pixel comparison, the text that both sides have and agree on: same string, same ink color, same place. The live page supplies its text from the DOM. The target image supplies its text from OCR, run once at registration. Text that differs in any of the three, or that only one side has, stays in the pixels and is judged as it is today.
3. Adds a `text` delta that says what the text says on each side, for the components whose text string differs.

Terms used below:

- **Component**: a DOM element on the live page that carries a `data-conciv-source` attribute (a source location), with its box, styles and children. The client collects them; the server receives them as `LiveComponent` records.
- **Target model**: what `design_target` stores for a registered image: the raster, the viewport and a node tree. For a PNG target the tree is one root node covering the image; after this change the root also holds one child node per OCR run.
- **Run**: one piece of text with its box. A **target run** is a `kind: 'text'` node under the target root, produced by OCR. A **live glyph** is a text node under a component, with its string and its line boxes, produced by the DOM.
- **Tile**: the crop of the live and target rasters around a component's box, grown by `tileMargin`, that the matcher compares to get the component's **mismatch**: the share of the tile's pixels that differ after a blur of `blurRadius`.
- **Pair**: a live component matched to a box in the target raster. The matcher creates pairs top down and only descends into a component's children when the component's mismatch is at or above `tileGate` (0.005).
- **Gated**: a pair with mismatch at or above `tileGate`. The delta kinds run on gated pairs only.
- **Reported**: a gated pair that has deltas, or that has no gated children. Only reported pairs appear in the diff report.
- **Above tolerance**: `componentAboveTolerance` in `shared/above.ts`: a reported component with deltas or with mismatch at or above `tileGate`. `design_status` is `done` for a route when no component is above tolerance and nothing is unmatched; otherwise the route is **open**.
- **Tools**: `design_target` registers an image for a route and width; `design_diff` captures the live page and compares; `design_status` summarizes the last diff per width.
- **The spike**: the measurement of OCR engines on the fixture pages, recorded in `docs/superpowers/specs/2026-11-01-design-text-layer-spike.md` (results plus the two source files this design ports).
- **ppu**: the npm package `ppu-paddle-ocr`.

## The Problem

A designer exports a PNG from Figma or Sketch, or screenshots a browser on another OS. The live page is rendered by the developer's Chromium. Hinting, subpixel positioning and gamma differ, so glyph strokes shift by a pixel and anti-aliased edges blend differently. The pixel comparator (`blazediff` with anti-aliasing detection on) still sees the toolbar buttons mismatch above `tileGate` on text pixels alone. Measured in PR #650's CI against a Mac-rendered target: button mismatches of 0.0275 and 0.0177 with identical CSS.

Three consequences, all observed (issue #659):

1. A false `foreground` delta. `foregroundColor` in `server/raster.ts` takes the median of the Sobel edge pixels of the tile. Edge pixels are anti-aliased blends by construction, so it reported `live #5277f3` against `target #6284f4` for a declared `color: #ffffff`, with a suggested CSS fix that moves `color` away from the declared value.
2. A container whose own paint changed is hidden. The report keeps a container only when it has deltas or no gated children. When its text children are gated for rasterization noise, the container disappears, as the `badge` fixture's header did.
3. `design_status` never reaches `done` on a page with text.

The first attempt (branch `design-text-mask`) masked whole glyph boxes out of the pixel diff unconditionally. It removed the false deltas and also removed real signal: a recolored label and a changed label of the same width produced nothing, because their pixels were gone and nothing else compared them.

## Goals

1. Identical text rendered by two different rasterizers produces no delta and does not count against tolerance.
2. Changed text content produces one `text` delta on the component that paints it, carrying the live string and the target string.
3. Changed text color produces a `foreground` delta measured from glyph ink, not edges.
4. `design_status` reaches `done` on a page whose only differences are rasterization.
5. A target PNG exported at 1x is consumed as exported. (A 2x export is downscaled by the adapter's existing nearest-neighbour path and is outside this design's measured set; see Non-Goals.)
6. The OCR engine runs in Node on macOS and Linux CI with no native ONNX binary, no runtime download and no telemetry (verified in the spike with an empty `HOME`; see Verification Plan, "Privacy").

## Non-Goals

Each item names its ceiling: what the design does when it meets the case.

- **Figma node targets** (text, geometry and color straight from the design tree). Follow-up design.
- **Text change inside a component that stays below `tileGate`**, or under a parent the matcher does not descend into. A changed one-letter label whose pixels differ by less than 0.5% of its tile is not gated, so no `text` delta runs. Ceiling: `text` deltas exist only for gated pairs.
- **A whole row shifted by more than half a line.** Live and target runs then overlap by less than half the smaller box, form no group, stay in the pixels, and the existing geometry kinds report the shift. Ceiling: the half-overlap rule.
- **Weight, italic, decoration and letter-spacing changes** with the same string, the same ink color and box edges within `textOffsetPx`. They agree and are masked. Ceiling: the three agreement tests say nothing about glyph shape.
- **Tall targets.** PaddleOCR detection resizes the long side, so recall on small text falls on images taller than about 2000px. No band slicing. Ceiling: the fixture pages are 720px and 844px tall; taller pages may miss runs, which then stay in the pixels.
- **2x exports.** The adapter downscales nearest-neighbour; the spike measured native 2x shots only after a matching downscale and found no difference to 1x shots. Not asserted by a test.
- **Reading-order errors** on unusual inline wrapping (a floated span, bidi text). A misordered join is a string mismatch: unmasked, and a `text` delta whose two strings show the same words in different order.
- **Truncated text** (`text-overflow: ellipsis`): the DOM string is the full text, the painted text is shorter, OCR reads the painted text. Known false positive: a `text` delta whose live string is longer than its target string.
- **Hyphenation and soft hyphens**: a hyphen OCR reads at a line end is not in the DOM string. Known false positive of the same shape.
- **Icon fonts, rotated text, text over photographs**: OCR blind spots; the runs are missed and stay in the pixels as today.

## Critical User Journeys (CUJs)

### CUJ 1: Rasterization noise is not a finding

- **Given**: A target PNG of the fixture page (`?variant=target`) rendered by a Chromium with LCD text and subpixel positioning off, registered with `design_target`; the live page is the same variant rendered by the test's Chromium; the first toolbar button's tile differs above `tileGate` when compared raw (asserted by the test before anything else).
- **When**: `design_diff` then `design_status`.
- **Then**: No toolbar component is above tolerance, no `foreground` or `text` delta anywhere, status `done`.

### CUJ 2: A changed label is reported as text

- **Given**: The same target; the live page renders the toolbar's first button, which has a fixed width in the fixture, as `Download` where the design says `Export`.
- **When**: `design_diff`.
- **Then**: That button carries a `text` delta `live: Download`, `target: Export`, with the button's source location as provenance. No other component carries a `text` delta.

### CUJ 3: A recolored label is reported as color

- **Given**: The same target; the live page renders the first button's label in `#ffd166` instead of `#ffffff` (ΔE far above `colorDeltaE`, 3), same text.
- **When**: `design_diff`.
- **Then**: That button carries a `foreground` delta with `live` within `colorDeltaE` of `#ffd166` and `target` within `colorDeltaE` of `#ffffff`, and no `text` delta.

### CUJ 4: A container's own paint stays visible

- **Given**: The `badge-textnoise` fixture: the header's background differs from the design and its buttons differ only by a text-shadow that imitates rasterization.
- **When**: `design_diff`.
- **Then**: The header is reported with `deltas: []` and mismatch at or above `tileGate`; the buttons are below tolerance; status open.

### CUJ 5: A target registered before this change keeps working

- **Given**: A target stored by an earlier version. Its root node has `children: []`, so it has no target runs.
- **When**: `design_diff`.
- **Then**: Grouping is skipped, nothing is masked, results are those of the current release. Re-registering the target runs the text reader and stores its runs.

### CUJ 6: A designer's export

- **Given**: A PNG of the fixture's toolbar exported from Figma by hand at 1x (committed under `packages/it/test/fixtures/design/exports/`), registered for the route; the live page is the fixture.
- **When**: `design_diff`.
- **Then**: Neither button carries a `text` delta. (This is the Risks section's fallback trigger; see Verification Plan.)

## Technical Plan (Architecture)

### Step 1: the foreground estimator samples glyph ink

`glyphCoreColor({raster, box, glyphs, background, color})`, ported from the parked branch (commit 43d653446 in `design-text-mask`), replaces `foregroundColor`. Over the tile it marks a pixel as ink when it lies inside one of `glyphs` and its CIEDE2000 distance from `background` exceeds `colorDeltaE`, erodes that mask by one pixel (`eroded`, same commit) so anti-aliased edges drop out, and returns the median color of what is left, or `null` when nothing is left.

Its callers after commit 1:

- `sampledFills` in `server/deltas/colors.ts` returns `{background, foreground: string | null}`. `sideStyles` in `server/deltas.ts` sets `color` only when `foreground` is a string, so the `foreground` kind compares nothing when either side has no ink (its existing `undefined` guard covers it; the kind itself does not change).
- `colorEnricher` in `server/enrichers/color.ts` leaves `fills.foreground` out when the result is `null` (`fills.foreground` in the store schema is an optional string).

In commit 1 no glyph boxes exist yet, so both callers pass `glyphs: [tile box]`: ink anywhere in the tile. From commit 4 on, the matcher's pairs carry their component's glyph boxes and `sideStyles` passes those, so a button's ink is its label and not its icon. `colorAgrees` in the tile matcher reads only the sampled background and is untouched.

### Step 2: where text comes from

- **Live side**: `glyphs: {text: string; boxes: Box[]}[]` on each `LiveComponent`, one entry per text node in the component's subtree, stopping at descendant components (the parked branch's `glyphNodes`, commit 56785440c). Per node, `Range.selectNodeContents(node).getClientRects()` gives one rect per line; each rect is clipped to the component box, rounded out to whole CSS pixels (the capture is 1x, so CSS pixels are raster pixels on both sides) and grown by `glyphHalo` (the parked `glyphBox`). The node's string is kept whole; no per-rect substring.
- **Target side**: at `design_target`, after the adapter and the enrichers have produced the root node, the text reader reads the raster once and its runs are appended to `root.children` as `{kind: 'text', text, box}` nodes (the `TargetNode` type already has both fields). Appending after `enrich` keeps the color enricher off them. A target stored earlier has `children: []` and so no runs.

### Step 3: the text reader

The `TextReader` slot in `Comparators` exists and is `null`; it is filled by a `paddle` reader selected by a new `text` config field (single value, like `geometry`, `color`, `capture` and `matcher`).

The reader runs PaddleOCR PP-OCRv6 tiny (detection and recognition) with ONNX inference on `onnxruntime-web` (WebAssembly). The spike measured wasm and native identical on all 28 renders: on the 390px fixture page, 15 of 15 runs recalled and 16 of 16 boxes correct in every renderer; on an added page of 11px to 14px text, 97 of 98 runs. Wasm loads one 15MB runtime file, needs no per-platform ONNX binary, downloads nothing and writes no telemetry. It runs on one thread (`ort.env.wasm.numThreads = 1`), about 0.3s per 1280x720 image, once per registration.

ppu 6.6.1 has no Node wasm entry: its `exports` map exposes `.`, `./web`, `./mobile` and `./coi-serviceworker.js`, and `.` imports `onnxruntime-node`. The reader therefore:

1. Finds the package directory with `dirname(createRequire(import.meta.url).resolve('ppu-paddle-ocr'))` (`.` resolves to `index.js`; `package.json` is not exported, so resolving it throws).
2. Imports `core/base-paddle-ocr.service.js`, `core/base-detection.service.js`, `core/base-recognition.service.js`, `core/session-factory.js` and `utils.js` from that directory by file URL. These are dynamic imports by necessity (no static specifier reaches an unexported file); they run once, inside the singleton's creation, and nowhere else in the package.
3. Imports `onnxruntime-web` statically; under Node its `exports` picks `dist/ort.node.min.mjs`. Imports `Canvas`, `Contours`, `cv` and `ImageProcessor` from `ppu-ocv` and `CanvasProcessor`, `CanvasToolkit` from `ppu-ocv/canvas`.
4. Builds the platform object exactly as the spike's `wasm-service.ts` does, constructs `BasePaddleOcrService`, creates the two sessions with `createSessionWithFallback`, calls `ImageProcessor.initRuntime()`, assigns `detectionSession`, `recognitionSession`, `options.recognition.charactersDictionary` (`parseDictionary`), `detector` and `recognitor`.
5. Loads the model files from the package's own `models/` directory, found through `createRequire(import.meta.url).resolve('@conciv/extension-design/package.json')` (exported), and passes them as buffers so ppu downloads nothing into `~/.cache`.

Pins: `ppu-paddle-ocr` 6.6.1, `ppu-ocv` 4.0.0 and `onnxruntime-web` 1.31.1 exact in the catalog, because a minor bump could move the imported files. ppu lists `onnxruntime-node` as an optional peer dependency; it is not installed because `onnxruntime-web` satisfies the peer set, and the root `allowBuilds: onnxruntime-node: false` stays as a second guard. `ppu-ocv` depends on `@techstark/opencv-js` (wasm) and `@napi-rs/canvas`, a prebuilt per platform with no install script; it is the one native binary. The model files (`PP-OCRv6_tiny_det.ort`, `PP-OCRv6_tiny_rec.ort`, `ppocrv6_tiny_dict.txt`, Apache-2.0 from PaddleOCR) are vendored under `models/`.

Options: `strategy: 'per-box'`, `minimumConfidence: 0` (the spike found confidence does not separate right reads from wrong ones; ppu's default filter would drop good reads), `flatten: true`, `noCache: true`. Input is the raster encoded to PNG bytes with the package's existing `encodePng`. Output boxes `{x, y, width, height}` map to `Box {x, y, w, h}`.

Each box is then trimmed to its ink (`trimToInk`, the spike's `trim.ts` re-implemented on `Raster`): the background is the box's top-left pixel, a pixel is ink when any channel differs from that background by more than `inkTrimThreshold` (40, in `shared/tolerances.ts`, from the spike's `sharp.trim` setting), and the box shrinks to the ink's bounding rectangle; boxes under 2px on a side stay as they are. Trimming brings the median edge error against DOM rects from 6px to 3px (8px max) on the spike set.

The service is a lazy singleton per process. Reads are serialized through a promise chain inside the reader (ppu's service is not reentrant). `destroy()` disposes the sessions and resets the singleton, so a second server in the same process (the integration test starts one) creates a fresh service; `src/server.ts` composes it into the extension's `dispose` beside `css.dispose`.

When the reader throws (wasm fails to load, a model file is missing), `design_target` still stores the target with no runs and returns `text: {runs: 0, error}` on its result (a new optional field on `TargetResultSchema`, precedent `DiffReport.hint`); on success it returns `text: {runs}`. Nothing in the extension can log, and `DESIGN_ERRORS` lists thrown errors only, so this field is the one channel.

### Step 4: agreement grouping

Once per diff, before the tile pass, and only when the target has runs:

1. **Items**: every live glyph's boxes (tagged with the component that owns the glyph) and every target run's box.
2. **Connected components** (union-find): two boxes are joined when their overlap exceeds half the smaller box's area. Joining is page-wide; it does not stop at component boundaries, because one OCR box often spans two neighbouring components (`Export` and `Create` on one line) and one DOM node often spans two OCR boxes (`Search` and `invoices`).
3. **A group** is a connected component with at least one live item and at least one target run. A connected component with items on one side only is not a group: its boxes stay in the pixels and nothing is said about them.
4. **Strings**: each side's items are sorted by their first box, top then left, where two boxes share a line when their vertical overlap is at least half the smaller height; the strings are joined, case folded, and all whitespace removed.
5. **Agreement**, all three required:
   - the two strings are equal;
   - `glyphCoreColor` over the group's live boxes on the live raster and over its target boxes on the target raster, each against the median background of its own box union, returns a color on both sides and the two are within `colorDeltaE`;
   - the union of the live boxes and the union of the target boxes agree edge for edge within `textOffsetPx` (8, the spike's maximum box error after trimming; `geometryPx` is 2 and would reject correct reads).
6. **Owner**: the component that owns the group's first live item, in reading order.

Output: `Group = {live: Box[]; target: Box[]; liveText: string; targetText: string; agrees: boolean; owner: LiveComponent}` for every group, plus the list of agreeing boxes on both sides.

A group that fails only the color or the position test is not masked and gets no `text` delta: its pixels trip the gate and the existing `foreground` and geometry kinds report it (CUJ 3). A group whose strings differ gets a `text` delta (Step 6).

### Step 5: what the pixel diff ignores

In the diff step, before the matcher runs, the agreeing boxes of all groups (both sides, each grown by `glyphHalo` plus `blurRadius`) are painted over: a copy of the live raster receives the target raster's pixels at those positions. The matcher then runs unchanged on that raster, so an agreeing group compares equal within its boxes and the tile's denominator, `tileGate` and every gate keep their meaning. The original live raster is kept for `sideFrom` (ink sampling), `unmatchedRegions` and the stored run image.

Everything else is unchanged: a disagreeing group keeps its pixels, trips the existing gate, the matcher descends, the pair is gated, and the delta kinds run as today. A one-sided run (placeholder, icon font, OCR miss, old target) is in no group and stays in the pixels.

### Step 6: the `text` delta

A new delta kind name, `text`. It is computed in the diff step's delta expression, beside the `Side`-based kinds, for every gated pair: when a disagreeing group whose strings differ is owned by the pair's component, one delta `{kind: 'text', live: group.liveText, target: group.targetText}`. It takes part in the existing report filter and ranking like any other delta.

Provenance: `DELTA_PROPERTIES.text` is empty (no CSS property), so the winner lookup finds nothing; `attribute()` instead sets `{via: 'source', file, line, column}` from the pair's `live.source`, with `'source'` added to the `via` enum. The fix prompt then keeps the delta and says: change the text from `<live>` to `<target>`. In the x-ray, `KIND.text` is `{name: 'text', measure: 'plain'}` and the existing `deltaSentence` prints both strings verbatim ("Text is Download, the design has Export."); no new component.

### Step 7: status

Unchanged: `done` when no component is above tolerance and nothing is unmatched. The page-level mismatch and the diff image are computed from the masked raster, so agreeing text no longer shows in the diff image; the x-ray overlay draws the live capture as taken.

### Data flow

```text
design_target(image)                           design_diff()
  adapter.load -> raster, root node              capture -> live raster, components{glyphs}
  enrichers                                      groups = agreement(components, target runs)
  text reader (paddle, wasm) -> runs             masked = live raster with target pixels over agreeing boxes
  root.children += runs (kind: text)             matcher.tile on masked (unchanged)
  store.put(model)                               gated pairs: existing kinds (foreground from ink) + text delta
  result.text = {runs} | {runs: 0, error}        existing report filter, provenance, status
```

### Constants

All in `shared/tolerances.ts`:

| name               | value        | role                                                                                       |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------ |
| `glyphHalo`        | 1            | pixels a live glyph box grows by (anti-aliasing halo)                                      |
| `inkTrimThreshold` | 40           | per-channel distance from the box's background that counts as ink when trimming an OCR box |
| `textOffsetPx`     | 8            | maximum edge distance between a group's live and target box unions                         |
| `colorDeltaE`      | 3 (existing) | ink color agreement and ink mask threshold                                                 |
| `blurRadius`       | 1 (existing) | added to `glyphHalo` when painting over agreeing boxes                                     |

Rules without a constant: an OCR box under 2px on a side is not trimmed; two boxes join when their overlap exceeds half the smaller box; two boxes share a line when their vertical overlap is at least half the smaller height.

## Alternatives Considered

### Alternative A: Mask all glyph boxes out of the pixel diff, compare nothing else

- **Pros**: Small change, no new dependency, removes the false `foreground` deltas.
- **Cons**: Loses every finding only visible through text: a changed label, a recolored label.
- **Reason for Rejection**: Built on branch `design-text-mask`; it traded false positives for false negatives.

### Alternative B: Edge-band masking plus ink color comparison, no OCR

- **Pros**: No dependency, no OCR latency. Masks only pixels where both rasters have ink within a pixel, so a moved or recolored glyph still shows.
- **Cons**: Its agreement test is "ink overlaps ink", which cannot distinguish `Export` from `Expert` in the same font and weight, and it cannot say what the text says. It needs a band width and an ink contrast constant in place of `textOffsetPx` and `inkTrimThreshold`; the count is a wash.
- **Reason for Rejection**: Step 1 is shared with B. For the masking decision, OCR string equality is a stronger agreement test than ink overlap at the cost of a dependency; the `text` delta comes with it. B is the fallback if OCR proves unreliable on real exports; the trigger is in Risks.

### Alternative C: A different pixel library (odiff, looks-same, SSIM)

- **Pros**: Drop-in replacement for the comparator slot.
- **Cons**: Same anti-aliasing heuristic as blazediff (already on and insufficient), or a per-window score that cannot name a component.
- **Reason for Rejection**: None addresses stroke-level shifts between rasterizers.

### Alternative D: OCR with tesseract.js or a transformer model

- **Pros**: tesseract is pure wasm; Florence-2 needs no detector.
- **Cons**: On the spike set, tesseract recalled 76.7% of runs at its best setting and 0 of the white-on-blue button labels in every setting; Florence-2 misread clear digits (`7000` as `70000`) and took 2 to 6 seconds per image.
- **Reason for Rejection**: Misses surface as rasterization noise left in pixels; misreads surface as false `text` deltas.

### Alternative E: PaddleOCR on onnxruntime-node (native)

- **Pros**: About three times faster than single-threaded wasm (0.1s against 0.3s per image).
- **Cons**: 290MB of per-platform binaries, a further 318MB CUDA download on linux-x64 unless `ONNXRUNTIME_NODE_INSTALL=skip` is set, telemetry written to the home directory unless `ORT_DISABLE_TELEMETRY=1` is set before load.
- **Reason for Rejection**: Speed is not needed for a once-per-target read; the install and telemetry costs land on every user.

### Alternative F: Figma node targets

- **Pros**: Text, geometry and color from the design tree; no OCR.
- **Cons**: A new target type, a Figma API dependency and auth; designers who export PNGs are still unserved.
- **Reason for Rejection**: The follow-up design; this layer stays useful for PNG targets regardless.

## Risks & Mitigations

- **OCR misreads a label on a real export** (font substitution, low contrast). A misread is a disagreeing group: the pixels stay in the diff and a `text` delta appears with the misread string. Mitigations: the delta shows both strings, so the user sees the misread for what it is; the README names it; CUJ 6 adds one real Figma export to the test set. **Fallback trigger**: if the Figma export of the toolbar yields more than one misread group, or more than 5% of groups across the measured set are misreads, Alternative B's ink-overlap test replaces the string test in Step 4 before release, and the `text` delta is dropped.
- **The reader throws or the wasm fails to load at `design_target`**: the target is stored with no runs and the result carries `text: {runs: 0, error}`; diffs work as today.
- **ppu internals imported by file path move in a release**: the three packages are pinned exactly; the integration test that asserts `text.runs > 0` after registration fails the IT, not a user, when a bump moves a file.
- **Untrusted PNG decode in `@napi-rs/canvas`**: the raster is already decoded by `pngjs` before the reader runs; the reader receives bytes re-encoded by the package, not the user's file, and the existing adapter's checks apply.
- **Memory**: the singleton holds about 60MB; reads are serialized inside the reader, so concurrent `design_target` calls queue rather than double it.

---

## Non-Functional Requirements

- **Install footprint**: `onnxruntime-web` is about 145MB in `node_modules` and the Node build loads one 15MB wasm file; `ppu-ocv` about 15MB plus `@techstark/opencv-js` about 30MB; `@napi-rs/canvas` about 30MB per platform; the three model files about 10MB. A second copy of `onnxruntime-web` lands beside the `1.26.0-dev` build already in the lockfile (pulled by `@huggingface/transformers`); `minimumReleaseAge: 2880` applies to the pins, all older than 48 hours. No install script runs (`@napi-rs/canvas` selects a prebuilt through optional dependencies). No network at runtime.
- **Latency**: OCR once per `design_target`, about 0.3s per 1280x720 image on one thread. `design_diff` gains the grouping pass (linear in runs after a sort) and one raster copy.
- **Privacy**: no telemetry; the spike verified this with an empty `HOME` on macOS and Linux (`linux-check.ts` in the spike).
- **Rollout**: no flag. See CUJ 5.

## Additional Resources

- `docs/superpowers/specs/2026-11-01-design-text-layer-spike.md`: engine measurements and the two ported sources (`wasm-service.ts`, `trim.ts`).
- Issue #659 (the bug), PR #650 (the extension this builds on), branch `design-text-mask` (first attempt; its glyph collection, `glyphCoreColor`, `eroded` and fixture variants are copied as noted in the plan).

## Future Improvements

- **Figma node targets**: text, geometry and color from the design tree.
- **Upstream Node wasm entry in ppu**: replaces the file-URL construction.
- **Pure-JS canvas for `ppu-ocv`**: removes the last native prebuilt.

---

## Detailed Implementation Plan

Worktree `/Users/omrikatz/Public/web/aidx-text`, branch `design-text-layer` off `main` at 02084232a. Paths are relative to `packages/extensions/design/` unless stated. The parked branch `design-text-mask` (worktree `/Users/omrikatz/Public/web/aidx-659`, commits 56785440c, 43d653446, 74f4381ae, 4e5c87adf on top of a5ef8054e) is a source of code to copy by hand, not to cherry-pick: its base predates the merge of main and its masking semantics differ.

The gate after every commit: `pnpm typecheck && pnpm lint && pnpm build` in the package, `pnpm exec turbo run build --filter='@conciv/it...'` at the root, `cd packages/it && pnpm exec vitest run test/design.it.test.ts` (all tests pass), and `pnpm exec fallow audit --changed-since 02084232a` at the root with 0 errors. From commit 4 on, also `pnpm test` in the package.

Fixture variants: `App.tsx` in `packages/it/test/fixtures/design/host/src/` maps `?variant=` to the page; a `TARGET_ALIASES` set (from 4e5c87adf) names the variants that render the `target` layout with one change. Commit 1 adds `badge` and `text-recolor` to it, commit 4 `textnoise` and `badge-textnoise`, commit 5 `text-changed`.

### Commit 0 (done): `docs(design): text layer design and OCR spike record`

The spike record at `docs/superpowers/specs/2026-11-01-design-text-layer-spike.md` and this document.

### Commit 1: `fix(design): the foreground estimate samples glyph ink, not anti-aliased edges`

Ships alone as its own PR on main if the rest is delayed.

#### 1. `src/server/raster.ts` (Modify)

- Port `eroded` and `boxMask` from 43d653446. Delete `foregroundColor`.

#### 2. `src/server/deltas/colors.ts` (Modify)

- Port `glyphCoreColor` from 43d653446. `sampledFills({raster, box, glyphs})` returns `{background: string; foreground: string | null}` with `foreground = glyphCoreColor({raster, box, glyphs, background, color})`; the `color` comparator is passed in by the caller. The `foreground` kind is unchanged.

#### 3. `src/server/deltas.ts` (Modify)

- `sideStyles` passes `glyphs: [tile box]` and sets `color` only when `foreground` is a string.

#### 4. `src/server/enrichers/color.ts` (Modify)

- Same call with `glyphs: [node.box]`; `fills.foreground` omitted when `null`.

#### 5. `src/server/matchers/tile.ts` (Modify)

- `colorAgrees` calls `sampledFills` with `glyphs: [pair.targetBox]`; it still reads only `.background`.

#### 6. `packages/it/test/fixtures/design/host/src/App.tsx`, `Toolbar.tsx`, `styles.css` (Modify)

- `TARGET_ALIASES = new Set(['badge', 'text-recolor'])`; `Toolbar` gets `labelColor` and sets `style={{color: '#ffd166'}}` on the first button when the variant is `text-recolor`. `styles.css`: `.toolbar button:first-child { width: 112px }` so a later label change does not move the sibling.

#### 7. `packages/it/test/design.it.test.ts` (Modify, additions only)

- `describe('text')` starts here with `text-recolor`: register `u1-1280`, go to the variant, diff; the first button (`source.file` `src/Toolbar.tsx`, first `button`) carries a `foreground` delta with `live` within `colorDeltaE` of `#ffd166` and `target` within `colorDeltaE` of `#ffffff`; the second button carries no delta.

### Commit 2: `feat(design): components carry their glyph runs`

#### 8. `src/shared/types.ts` (Modify)

- `Glyph = {text: string; boxes: Box[]}`; `LiveComponent.glyphs: Glyph[]`; `TextRun = {box: Box; text: string}` (reader output); `TextReader.read(input: {raster: Raster}): Promise<TextRun[]>`; `Comparators.text: TextReader` (drop `null`); `Registries.text: Record<DesignConfig['text'], TextReader>`.

#### 9. `src/shared/defs.ts` (Modify)

- `GlyphSchema`; `LiveComponentSchema.glyphs: z.array(GlyphSchema)`, described as the text nodes the component paints, each with one box per line, grown by the anti-aliasing halo.

#### 10. `src/shared/tolerances.ts` (Modify)

- `glyphHalo: 1`, `inkTrimThreshold: 40`, `textOffsetPx: 8`.

#### 11. `src/client/components.ts` (Modify; copy from 56785440c)

- `glyphNodes` and `glyphBox` as in the parked branch; `measureGlyphs` returns one `Glyph` per node with the node's whole string and its clipped, rounded, haloed rects; `componentTree` sets `glyphs`.

#### 12. `src/server/captures/tab.ts` (Modify)

- `LiveComponentTreeSchema` gains `glyphs: z.array(GlyphSchema)`.

#### 13. `packages/it/test/design.it.test.ts` `mapFixture` literal (Modify)

- Add `glyphs: []` to the `LiveComponent` literal it builds (type-required field; the one touch to an existing test). `src/xray/dev-fixture.ts` builds no such literal and is untouched.

#### 14. `src/server/registries/text.ts` (Create), `src/server/registries.ts` (Modify), `src/shared/config.ts` (Modify)

- Registry `text = {paddle: paddleReader}`; `pickRuntime` reads `config.text`; config `text: z.enum(['paddle']).default('paddle')`. In this commit `paddleReader` is a stub returning `[]` so the commit builds; commit 3 fills it.

### Commit 3: `feat(design): a target's text runs are read once at registration`

#### 15. `pnpm-workspace.yaml` (root), `package.json` (Modify)

- Catalog: `ppu-paddle-ocr: 6.6.1`, `ppu-ocv: 4.0.0`, `onnxruntime-web: 1.31.1` (exact). `allowBuilds` unchanged (`onnxruntime-node: false` stays; `@napi-rs/canvas` has no install script and needs no entry). Dependencies on all three. `files` gains `models`. `tsdown.config.ts` unchanged (dependencies are external already).

#### 16. `models/` (Create)

- `PP-OCRv6_tiny_det.ort`, `PP-OCRv6_tiny_rec.ort`, `ppocrv6_tiny_dict.txt`, with `LICENSE` (Apache-2.0, PaddleOCR) and a `README.md` naming the source release and SHA-256 checksums.

#### 17. `src/server/comparators/paddle.ts` (Create)

- The reader of Technical Plan Step 3: package directory through `createRequire`, file-URL imports of the five ppu modules inside the singleton's creation, the platform object from the spike's `wasm-service.ts`, `recognize`, box mapping, `trimToInk` (from the spike's `trim.ts`, on `Raster`), promise-chain serialization, `destroy()` that disposes both sessions and resets the singleton. Exports `paddleReader: TextReader` and `destroyPaddle(): Promise<void>`.

#### 18. `src/server.ts` (Modify)

- `dispose: async () => { await destroyPaddle(); await css.dispose() }` (or the sequential equivalent the file's style allows).

#### 19. `src/shared/defs.ts` (Modify)

- `TargetResultSchema.text: z.object({runs: z.number(), error: z.string().optional()}).optional()`.

#### 20. `src/tool/steps/target.ts` (Modify)

- After `enrich`: `runs = await design.comparators.text.read({raster: model.raster})` in a try; on success `root.children` gains `{id, kind: 'text', text, box, children: []}` per run (ids `text-<index>`) and the result carries `text: {runs: runs.length}`; on failure the root is stored as is and the result carries `text: {runs: 0, error: message}`.

#### 21. `packages/it/test/design.it.test.ts` (Modify, additions only)

- In `describe('text')`: register `u1-1280`; assert `text.runs > 0` on the result; read the stored model with `readFile` from the design state dir's `<id>/model.json` (the same directory the run-image test reads) and parse it; assert one child of `root` has `text` `Export` (case folded) and a box inside the first button's box, taken from `design_capture` on the `target` variant.

### Commit 4: `feat(design): text both sides agree on leaves the pixel diff`

#### 22. `src/server/text-groups.ts` (Create)

- `groupText({components, runs, live, target, color}): {groups: Group[]; agreeing: Box[]}` implementing Step 4: union-find over boxes with the half-overlap rule, both-sides requirement, reading-order join, case fold, whitespace removal, the three agreement tests (`glyphCoreColor` on each raster, `textOffsetPx` edges), owner by first live item. Returns `{groups: [], agreeing: []}` when `runs` is empty.

#### 23. `src/server/raster.ts` (Modify)

- `paintOver({onto, from, boxes}): Raster` copies `from`'s pixels into a copy of `onto` over each box, clipped to both rasters.

#### 24. `src/tool/steps/diff.ts` (Modify)

- After the capture: `runs` = `kind: 'text'` children of `target.root`; `{groups, agreeing} = groupText(...)`; `masked = paintOver({onto: live.raster, from: target.raster, boxes: agreeing grown by glyphHalo + blurRadius})`; `matcher.match({live: {...live, raster: masked}, ...})`. `sideFrom`, `unmatchedRegions` and `writeRun` keep `live.raster`; `paintDiff` uses `masked`.

#### 25. `src/server/deltas.ts` (Modify)

- `sideStyles` passes the pair component's glyph boxes (live side) or the group's target boxes (target side) as `glyphs` instead of the tile box; falls back to the tile box when the component has no glyphs.

#### 26. `package.json`, `vitest.config.ts` (Modify, Create)

- `test: vitest run`, devDependency `@conciv/vitest-config` (as `packages/it` has), config extending it. Unit tests in `src/server/text-groups.test.ts` (reading order on two lines, one DOM node over two OCR boxes, one OCR box over two nodes, one-sided component forms no group, whitespace and case, each agreement test failing alone), `src/server/comparators/paddle.test.ts` for `trimToInk` (ink inside, no ink, box under 2px), and `src/server/deltas/colors.test.ts` for `glyphCoreColor` returning `null` on a flat tile. All on synthetic rasters built in the test; no OCR engine, no browser.

#### 27. `packages/it/test/fixtures/design/host/src/App.tsx`, `Toolbar.tsx` (Modify)

- Variants from 4e5c87adf: `textnoise` (`TEXT_NOISE`, a 0.5px text-shadow in `currentColor` on both buttons, which stays inside `glyphHalo` plus `blurRadius` and stands in for a second rasterizer in the same browser) and `badge-textnoise`; both in `TARGET_ALIASES`.

#### 28. `packages/it/test/fixtures/design/render-targets.ts` (Modify)

- A fourth shot `u1-1280-grayaa` of `/?variant=target` by a second Chromium launched with `--disable-lcd-text --disable-font-subpixel-positioning`, closed after the shot. The renderer also writes `u1-1280-grayaa.json` with the first toolbar button's `getBoundingClientRect` box as `{x, y, w, h}`.

#### 29. `packages/it/package.json` (Modify)

- devDependency `pixelmatch: catalog:` (already in the catalog).

#### 30. `packages/it/test/design.it.test.ts` (Modify, additions only)

- In `describe('text')`:
  - `textnoise`: no deltas, no component above tolerance, status `done`.
  - `badge-textnoise`: the header reported with `deltas: []` and mismatch at or above `tileGate`, both buttons below tolerance, status open.
  - `u1-1280-grayaa`: precondition first: read both PNGs with `pngjs`, crop the button box from the JSON grown by `tileMargin`, run `pixelmatch` with `includeAA: false`, and require the differing share to be at or above `tileGate`. On CI (`process.env.CI`) a failed precondition fails the test; locally it skips with a message naming the measured share. Then register `u1-1280-grayaa`, go to `?variant=target`, diff: no toolbar component above tolerance, no `foreground` or `text` delta, status `done`. The search input's placeholder is not a DOM text node and stays in the pixels; the assertion is scoped to components whose `source.file` is `src/Toolbar.tsx` plus the page status.
  - Real export (CUJ 6): register `packages/it/test/fixtures/design/exports/toolbar-figma-1280.png` (made by hand before this commit lands) for `/?variant=target`, diff, assert no `text` delta on either button. If this fails, the test's failure message lists every `text` delta's two strings; the fallback decision in Risks is taken on that evidence.

### Commit 5: `feat(design): a text delta says what the text says on each side`

#### 31. `src/shared/defs.ts` (Modify)

- `'text'` in `DELTA_KIND_NAMES`; `'source'` in `ProvenanceSchema.via`.

#### 32. `src/server/provenance/delta-properties.ts` (Modify)

- `text: () => []`.

#### 33. `src/server/deltas.ts` (No entry)

- `DELTA_KINDS` there lists `Side`-measured kinds; `text` is produced in the diff step and is not added.

#### 34. `src/tool/steps/diff.ts` (Modify)

- In the delta expression for each gated pair, append `{kind: 'text', live, target}` for every group owned by the pair's component whose strings differ. In `attribute()`, a `text` delta skips the winner lookup and gets `{via: 'source', file, line, column}` from `pair.live.source` when present.

#### 35. `src/xray/list.tsx`, `src/xray/fix-prompt.ts` (Modify)

- `KIND.text = {name: 'text', measure: 'plain'}`; `fixPrompt` wording for `text`: change the text from `<live>` to `<target>`.

#### 36. `packages/it/test/fixtures/design/host/src/App.tsx`, `Toolbar.tsx` (Modify)

- Variant `text-changed`: the first button's label `Download`; in `TARGET_ALIASES`.

#### 37. `packages/it/test/design.it.test.ts` (Modify, additions only)

- `text-changed`: the first button carries a `text` delta `live: 'Download'`, `target: 'Export'`, `via: 'source'`, `file: 'src/Toolbar.tsx'`; no other component carries a `text` delta.

### Commit 6: `docs(design): text is compared as text`

#### 38. `README.md` (Create)

- What the extension does, Steps 1 to 7 in prose, the OCR engine and runtime, the pins and why, the constants table, the Non-Goals list as blind spots and known false positives.

### Verification Plan

- **Build**: the gate above after every commit.
- **Unit**: `pnpm test` in the package from commit 4 (item 26).
- **Integration**: `design.it.test.ts`, three consecutive green runs before the PR.
- **Cross-renderer (Goal 1, CUJ 1)**: the `u1-1280-grayaa` test in commit 4, with its precondition.
- **Real export (Goal 5, CUJ 6)**: the Figma export test in commit 4; its outcome decides the Risks fallback before the PR is marked ready.
- **Reader construction (Goal 6)**: the `text.runs > 0` assertion in commit 3; a bump that moves a ppu file fails the IT.
- **Privacy (Goal 6)**: the spike's `linux-check.ts` result is recorded in the spike document; not re-run per build.
- **Static analysis**: `fallow audit`, 0 errors.
