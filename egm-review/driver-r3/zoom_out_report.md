# egm-zoom-out review: `docs/designs/design-driver.md`, revision 3

Standard: zoom-out-standard. Read: the document, four spike records, the r2 consolidated and zoom-out reports, and `shared/types.ts`, `shared/config.ts`, `shared/tolerances.ts`, `server/registries.ts`, `server/store.ts`, `server.ts`, `server/breakpoints.ts`, `server/captures/tab.ts`, `server/comparators/paddle.ts`, `server/text-groups.ts`, `tool/steps/diff.ts`, `tool/steps/target.ts`, `client/capture.ts`, `whiteboard/src/client/overlay.tsx`, `harness-init/src/agent-guide.ts`.

## Verdict: changes required (2 Blocker, 6 Major, 4 Nit)

Revision 3 takes most of the r2 simplifications (pairs recomputed, no undo, no Jev, no verification, file store, `extra` informational, spike claims corrected, tests listed). The new complexity is in measurement: three geometry sources with precedence and `disagreement` rows, two capture paths, a tab worker taking over OCR, a no-target sweep. Part of it rests on a claim the fixture disproves (B2).

### B1. Blocker: save-triggered rounds use the agent's budget and trip the stop rules (r2 D1 still open)

Lines 34, 38, 178, 202, 204, 367. `round` counts runs since registration; runs are triggered by every settled save, `design_diff`, and every pin, mark or acceptance. One fix touching three files saves seconds apart, beyond the 150 ms debounce: the budget of 8 is spent on half-applied edits; `stalled` fires on an unrelated save; `oscillating` fires on a revert-then-redo across files; a user's mark takes a round from the agent. Breaks Problem 1's promise. **Fix, compatible with ruling 7:** rounds on saves keep pixels fresh, but `round`, budget and the stall/oscillation history count only on `design_diff` calls.

### B2. Blocker: the "width-invariant" split is false, and the pixel side of CUJ 3 is undefined

Lines 13, 30–32, 99, 149, 181–182, 185, 199, 202.

1. Font size, line height, padding and gaps change with width. The fixture's own `styles.css` has `@media (min-width: 600px) { .toolbar { padding-right: 24px } }` (takumi spike line 173). CUJ 3 at a 390 tab against a 1280 design reports a `padding` delta on CSS that is correct at 1280; the agent edits the mobile rule.
2. Both capture paths capture at the tab's width. With tab 390 and target 1280, the pixel diff, the agreeing-text mask (`text-groups.ts:68–87` samples ink from both rasters), `sideFrom` color sampling (`diff.ts:247–264`) and `residualShare` all run on images of different widths; the document never says how.
3. `disagreement` can rarely fire: takumi and the mirror are mutually exclusive; DOM measures a different width. The precedence rule, per-row `source` and `confidence`, and the `disagreement` item exist mostly to cover point 1.
   **Simplest:** widths match, read everything from the live DOM; widths differ, read everything (rects, computed styles, pixels via snapdom on its document as `client/frame-capture.ts:23` already does) from the scriptless mirror sized to the target width. The mirror is real browser layout; the takumi spike used exactly that static serialized DOM as its ground truth (lines 22, 31) and takumi only approximates it (1–2% drift, p95 7.4 px at 390, `clamp` dropped, container queries ignored, slower). Removes `takumi-paint`, `@takumi-rs/wasm`, `@chenglou/pretext`, `sources/takumi.ts`, `serialize.ts`, `sources/subset.ts`, font-bytes plumbing, CSS pre-resolution, the precedence rule and the `disagreement` item. `GeometrySource` becomes DOM or mirror.

### M1. Pixel diff and target-image analysis do not need the tab worker

Lines 30, 145–146, 151, 170–171, 216, 337. OCR shipped in #683 in the engine (Node, macOS and Linux CI verified, `design-text-layer.md:52`); moving it means shipping ONNX models to the browser, a worker channel, and `design_target` failing without an overlay. Segmentation reads only the target PNG the engine holds; `ppu-ocv` already runs there (`paddle.ts:8`). The engine needs the live raster anyway for `groupText` and `sideFrom`, so running blazediff in the worker saves no transfer. "Everything runs in the browser" is about rendering the page, not analysing an image file. **Simplest:** OCR, segmentation and pixel compare stay in the engine; the tab does rects, styles, the mirror, capture, and the render search. With B2, no worker remains.

### M2. Measurement infrastructure owned by a UI pane

Lines 160, 181, 182, 189, 216. The overlay owns the measurer, the capture stream, the mirror and the worker; line 189 makes its visibility a precondition. Closing the x-ray leaves `design_diff` without a measurer. **Simplest:** measurer and mirror live in the extension's client code (always loaded; `captureStep` at `client/capture.ts:91` is the home), mirror as a hidden iframe; the overlay renders reports and records decisions. Keeps Step 5 independent of Steps 3–4.

### M3. Two capture paths; Region Capture is not motivated by any listed problem

Lines 30, 150, 181, 278, 349, 391. snapdom exists (`client/capture.ts:99`). Region Capture adds a permission prompt, a held stream, an on-screen 1:1 condition, a second rasterizer, a Chromium/Firefox split, and cannot capture at the target width (B2). r2 M7 in a new form. **Simplest:** snapdom only, of the live page or the mirror; Region Capture to Future Improvements gated on a trial showing snapdom fidelity is wrong.

### M4. A new `Pairer` duplicates `Matcher` and `groupText`; fate of existing slots unstated

Lines 49, 63, 142–156, 183, 359. `Matcher` (`types.ts:114–122`) already produces `Pair[]`; `groupText` (`text-groups.ts:214`) already pairs text by overlap and folded equality; `GeometryEstimator` (`edge-projection`) exists. Line 63 lists them, the slot table omits them, line 49 keeps the matcher as fallback, section 3.4 restates the rules. **Simplest:** say `Pairer` replaces `Matcher` and `GeometryEstimator` (delete them) or extend `tileMatcher`; reuse `groupText`'s text pairing.

### M5. The no-target sweep is a new feature outside the problem

Lines 113–117, 222–224, 298, 376–380. No Problem item asks for it; it is the main remaining consumer of takumi and pretext after B2; already deferred as a tool yet built behind `design_diff`. **Simplest:** no-target `design_diff` returns the sentence only; sweep to Future Improvements; drop items 42 and 44.

### M6. Spurious or swallowed segmentation boxes become structure-stage `unbuilt` items on pages that render

Lines 76, 183, 185, 197, 202. `unbuilt` is a structure item at any time while `extra` got the empty-page condition; `unpairedShare` leads the tuple. The spike reports 0–3 spurious frames, up to 8 spurious image leaves, whole sections collapsed into one image leaf; a live `div` hero never pairs with an `image` node. On CUJ 1 the first stage asks for boxes that exist or do not, and the loop ends `stalled`. The spike's quality gate with text-only fallback (`segmentation.md:14`) is not carried. **Simplest:** `unbuilt` like `extra`, a structure item only on an empty page; never treat `image` nodes as `unbuilt` on a page that renders.

### N1. Single-implementation slots multiplied (40, 140–160, 359)

Seven new slots. Follows the codebase pattern (single-member enums exist), so a Nit. `RoleRules` and `Ranker` have a named second implementation; `Segmenter` and `Aligner` do not. Plain imports until a second appears.

### N2. Altitude (171, 172, 182): per-pixel and serialization recipes belong in README or plan steps.

### N3. `trimToInk` placement (64): lives in `server/comparators/paddle.ts:182`, imported by `text-groups.ts:4`; `medianColor` is correct. If OCR moves to the client, `text-groups.ts` would import from a client file.

### N4. Hierarchical alignment and impact ranking have no trial evidence (33, 184, 187). `diff.ts:287` already ranks measured-first then mismatch × area. Ship existing ranking with top-down ordering; add the aligner if Step 7 trials show one top fix does not clear rows beneath it.

## Status of r2 findings

D1 rejected by ruling 7, defect stands (B1, counting-only fix keeps the ruling). D2–D5 adopted. D6 carry and `target_elements` dropped; slots expanded (N1). D7 file store. D8 adopted for `extra`, `unbuilt` has the same problem (M6). Spike claims, records, estimator timing, tests, fixture facts, skill text, route walker, name collisions (except `trimToInk`), security wording, `@conciv/skills` dependency: fixed. Two capture renderers reintroduced (M3). `tinypool`/`p-queue` gone.

## Keep as is

Flat target list with the live DOM as the only tree; roles from rules and the expression guard; server-owned stage, score, stop computed before truncation; decisions as the only persistent state in a file store; acceptance outside MCP; the scriptless mirror replacing the app-rendering frame; width from the PNG header with the session's current target; `createDiffer` as the single composition root.
