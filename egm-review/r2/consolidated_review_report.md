# Consolidated Review Report, round 2: 2026-11-01-design-text-layer.md

**Target:** `/Users/omrikatz/Public/web/aidx-text/docs/superpowers/specs/2026-11-01-design-text-layer.md` (352 lines; FeatureRange 1..219, DetailedRange 220..352)
**Stage reports:** `zoom_out_report.md`, `comprehension_report.md`, `design_report.md`, `structural_report.md`, `style_report.md`, `intermediate_zoom_out_report.md`, `implementation_readiness_report.md`, `codebase_details_report.md` (all in this directory).

## Verdict

Does not pass. Round 1's architecture change (mask only text both sides agree on) is in place and A2, A3, A7, A9 and A12 are resolved. One cause produces every remaining Blocker: agreement is decided per component, on string equality alone. Every reviewer independently found that a recolored label agrees, gets masked, drops below `tileGate`, and is never reported, so CUJ 3 fails and commit 1's own test breaks at commit 4. The same per-component grouping gives one-sided groups a `target: ''` string, which brings back the deltas round 1 removed and breaks CUJ 5. Stage 8 shows that fixing the cause makes the design smaller, not larger.

## Action items

### 🔴 Blockers (design)

**A1. Agreement must test ink and position, not strings alone.** Step 4.3: a group agrees when (i) the joined strings are equal after case folding with all whitespace removed, (ii) the glyph ink color on each side, measured with the parked branch's `glyphCoreColor` (ΔE mask, 1px erosion, `null` when no ink) over the group's boxes, is within `colorDeltaE`, and (iii) the union of live boxes and the union of target boxes agree edge for edge within a new constant `textOffsetPx: 8` (the spike's max box error; `geometryPx` 2 is too tight). A group that fails only (ii) or (iii) is unmasked and gets no `text` delta; the existing `foreground` and geometry kinds report it. A `text` delta needs (i) to fail. Closes: zoom-out 1, comprehension 1, design B1 and M5, structural S1, style B1, readiness B1. Weight, italic, decoration and letter-spacing changes that pass all three become a named blind spot.

**A2. Grouping is page-wide connected components, and a group needs both sides.** Step 4.1 and 4.2: union-find over live text-node boxes and target run boxes with the half-overlap rule, across component boundaries. A connected component with runs on one side only is not a group; skip grouping when the target has no runs. Reading order sorts each side by its first box. A disagreeing group is attributed to the owner of its first live item. Delete the translation clause, the "not yet paired" clause and `groupText`'s `pairs` input (they are circular: pairs exist only after the tile pass, `tile.ts:86-95`). Closes: design B2, B3, M1; structural S2, S4; style B2, M3; comprehension 2, 6; readiness B2, M8; codebase 3; zoom-out 2.

**A3. Live text is `{text, boxes}` per text node, collected to component boundaries.** Step 2 and items 7, 8, 10: `glyphs: {text: string; boxes: Box[]}[]`, one per text node in the component's subtree stopping at descendant components (not `ownTextNodes`' direct children only), boxes from `Range.selectNodeContents(node).getClientRects()` clipped, rounded, grown by `glyphHalo`. No substring walk. `TextRun` stays target-side only. Closes: zoom-out 3, design N5, comprehension 7, codebase 10 (parked `glyphNodes` recurses and `glyphBox` already applies the halo), readiness N4.

**A4. Masking happens on the raster, before an unchanged matcher.** Step 5 and items 1, 22, 23: in `diff.ts`, before `matcher.match`, copy the target's pixels into a copy of the live raster over every agreeing group's boxes (both sides, grown by `glyphHalo` plus `blurRadius`); pass that raster to the matcher. Keep the original raster for `sideFrom`, `unmatchedRegions` and `writeRun`. Delete `boxMask`, `shareInside` (its denominator is the unmasked region, not the tile: codebase 2, readiness M7), the `ignore` parameter, `Matcher.match`'s `groups`, and Step 7's "stay raw" sentence (the diff image becomes masked; say so). Closes: design M4 (neighbour text inside `tileMargin`), zoom-out 5, codebase 2 and 22, readiness M6 and M7, style N14.

**A5. The `text` delta is computed with the delta kinds, for gated pairs, before the filter.** Step 6 and item 30: inside the `deltas` expression at `diff.ts:191-196`, for every pair at or above `tileGate`, before the filter at line 211. Fix the circular "reported" definition at line 25. Closes: design M3, structural S3, style M2.

**A6. OCR runs are `kind: 'text'` children of `root`.** Items 12 and 13 and `TargetModel.text` go away. Append after `enrich` so the color enricher does not touch them. Old targets already load with `children: []`, so CUJ 5 needs no special case. Closes: zoom-out 4.

**A7. Step 1 uses `glyphCoreColor` with erosion and lists its real callers.** Items 1 to 4: port `glyphCoreColor` and `eroded` from 43d653446, called with `glyphs: [box]` in commit 1. Drop item 4 (`colorAgrees` reads only `.background`, `tile.ts:65-71`). Add `server/enrichers/color.ts` to commit 1 and leave `fills.foreground` out when the result is `null` (`store.ts:34` schema is `z.string().optional()`; a stored `null` fails parse). Fix line 96 and line 210. Closes: design M7, N1, N2; comprehension 5; codebase 4; readiness B3, M10, N2; zoom-out 6; style N11.

### 🔴 Blockers (plan)

**A8. Package resolution.** `createRequire(import.meta.url).resolve('ppu-paddle-ocr/package.json')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`; use `dirname(require.resolve('ppu-paddle-ocr'))` (`.` exports `./index.js`). Line 109 also omits `./coi-serviceworker.js` from the exports list. The spike imports `CanvasProcessor`/`CanvasToolkit` from `ppu-ocv/canvas` and `parseDictionary` from `utils.js`, and assigns `service.detector`, `service.recognitor`, `charactersDictionary`. Say which `onnxruntime-web` entry is imported (`dist/ort.node.min.mjs` under Node) and how `models/` is found from `dist/` (resolve `@conciv/extension-design/package.json`, already exported, `package.json:53`). Closes: codebase 1, 14, 20; readiness M3.

**A9. `ocr-failed` path.** `toolError(code, {message?, data?})` has no `cause`; nothing in the extension can log; `DESIGN_ERRORS` lists thrown errors only; `TargetResultSchema` has no warning field, so "reported by the tool" (line 192) and "logged, not thrown" (item 19) cannot both hold. Decision: add an optional `text: {runs: number; error?: string}` field to `TargetResultSchema` (precedent: `DiffReport.hint`, `defs.ts:132`), return it, do not add to `DESIGN_ERRORS`, and have the item 20 test assert `runs > 0`. Closes: readiness B4, codebase 7, design N4, style M4, structural S6, comprehension 3, zoom-out 7.

**A10. Shutdown and concurrency.** List `src/server.ts` (compose `css.dispose` with the reader's `destroy`; `destroy` resets the singleton because the IT starts a second server in the same process, `design.it.test.ts:370-379`). Serialize reads with a promise chain inside the reader; delete the false "store's write queue" claim (the queue wraps only `put`, `store.ts:151-155`). Closes: readiness M1, M2; design M6; comprehension 4; codebase 8, 25; zoom-out 8.

**A11. Commit 4 fixtures and renderer.** `u1-1280-grayaa` is diffed against `?variant=target` (the `/` page carries the `inset-right` delta); the `Search invoices` placeholder has no DOM text and stays in pixels, so either the assertion is scoped to the toolbar or the input is removed from the `target` variant for this test. The precondition (raw first-button tile mismatch above `tileGate`) must say how the box is found and which comparator computes it; `renderTargets` returns `void` and `packages/it` cannot import `tileMismatch`. Decision: the renderer also writes `u1-1280-grayaa.json` with the first button's box (from `getBoundingClientRect` in the page) and the test computes the raw mismatch with `pixelmatch` (already a dependency of the design package; add it to `packages/it` devDependencies) over that box plus `tileMargin`. The precondition fails on CI (`process.env.CI`) and skips locally, so the goal is never silently untested. Closes: readiness M11, M12, M13; codebase 12, 13; style M10; comprehension 10.

**A12. Text delta provenance and x-ray.** `DELTA_PROPERTIES.text = []` leaves no `via`/`file`, so `fixPrompt` drops the delta. Decision: `attribute()` sets `via: 'source'`-style provenance from `pair.live.source` for `text` deltas (name the `Provenance.via` value added). `KIND.text.measure` is `'plain'` ("no measure" is not representable). State how `DeltaLine` renders two strings (it prints `deltaSentence` plain text today). Closes: readiness M9, codebase 9.

### 🟡 Major

**A13. Spike evidence file.** Commit the spike document (results, `wasm-service.ts`, `trim.ts`) as the first commit, with a real path, so every number in Step 3 and Alternative D can be checked at review time and commit 3 can port from it. Closes: structural S8, comprehension 8, style M12, readiness M3.

**A14. Non-Goals with ceilings.** Add, each with the ceiling stage 8 states: text change below the gate or under a non-descended parent (design M2); row shifts over half a line (design M1); weight/italic/decoration/letter-spacing with equal string, color and edges; tall targets above ~2000px (band slicing removed from item 18 and Risks); 2x exports (adapter's nearest-neighbour downscale; reword Goal 5); reading-order misorder on unusual inline wrapping; truncated text as a known false positive, not a blind spot (style M9); hyphenation and soft hyphens (design N3). Delete the false PNG size-limit claim (line 194).

**A15. Constants inventory.** Line 57 says one new constant; the design has `glyphHalo`, `inkTrimThreshold`, `textOffsetPx`, the 2px trim floor, the half-overlap rule and the half-height line rule. List them and reword the Alternative B "two tuning constants" argument. Closes: structural S5, style M1.

**A16. Alternative B fallback trigger.** Give a number: e.g. more than one misread group on the toolbar's real export, or more than 5% misread groups on the measured set. Closes: style M8, readiness M16, structural S7 (also assign the real-export test to commit 4 with a path).

**A17. CUJ coverage.** Add a CUJ for a designer export (Goal 5) and point Goal 6 at the verification step. Define "open" status. Closes: structural S7, S9; style N4.

**A18. Remaining plan corrections.** Item 14: drop `xray/dev-fixture.ts` (no `LiveComponent` literals). Item 20: no test reads `model.json` today; describe the read directly, and take the button box from `design_capture` on `target`, not a prior diff (readiness M14). Item 11: parked `tab.ts:15` is `z.array(BoxSchema)`, use the new schema. Item 16: name the `allowBuilds` key; drop the redundant tsdown externals; note the second `onnxruntime-web` copy beside `1.26.0-dev` and that `minimumReleaseAge: 2880` applies; state ppu's dependency type for `onnxruntime-node` and how it is kept out of installs (readiness M4). Item 6: name `styles.css` and a selector for the first button; 96px is too narrow for `Download`, use 112px. `TARGET_ALIASES` per commit (commit 1: `badge`, `text-recolor`; commit 4: `textnoise`, `badge-textnoise`; commit 5: `text-changed`); drop `badge-recolor`. Item 29: `DELTA_KINDS` lives in `server/deltas.ts`. Footprint: add `@techstark/opencv-js`. Closes: codebase 5, 6, 11, 15-19, 21, 24, 27; readiness N1, N3, N5, N7, N9.

**A19. Unit tests for pure code.** `groupText` (reading order, wrapped node, one-sided, whitespace), `trimToInk`, `glyphCoreColor` null path. The design package has no test setup; say where they live (vitest in the package, matching the repo's frontend convention). Closes: readiness M15.

### 🟢 Nits

Terms: "component gate" → `tileGate`; "ppu"; "the server's shutdown hook" → `dispose`; "matched run group"; `Side`; "28 renders" tied to the pages; runs vs boxes counts at line 107; "near" at line 78 → within `colorDeltaE`; "reader" meaning a human at line 191 → "the user"; "ships one 15MB file" → "loads"; install-script wording (lines 109 vs 202); "fails the build" → "fails the IT"; 6px→3px (8px max) before/after trimming; `textnoise` rationale (why a text shadow stands in for a rasterizer, and that 0.5px stays inside halo + blur); "verified with an empty HOME" tense; `ciede2000` import path and per-pixel cost; `null` guard in the `foreground` kind is unreachable. Closes: style N1-N13, N15-N17; comprehension 9, 11-15; structural S10, S11; codebase 16, 17, 23, 26; readiness N6, N8.

## Rejected reviewer recommendations (stage 8)

- A separate box-size clause in the agreement predicate (design B1); the edge bound covers it.
- Top-quartile ΔE clustering (design M7); `glyphCoreColor` exists.
- A second regrouping pass after matching (design M1).
- A forced gate or ancestor re-attachment for disagreeing groups (design M2).
- A pixel-count cap on PNG decode (design M6, zoom-out 8); pre-existing gap.
- Cutting target runs at live boundaries; per-box OCR has no character positions.
- `sameGeometry` guard on `text` deltas; it would suppress CUJ 2.

## Traceability matrix

| Action | zoom-out | comprehension | design         | structural | style       | stage 8 | readiness              | codebase                    |
| ------ | -------- | ------------- | -------------- | ---------- | ----------- | ------- | ---------------------- | --------------------------- |
| A1     | 1        | 1             | B1, M5         | S1         | B1          | (a)     | B1                     | —                           |
| A2     | 2        | 2, 6          | B2, B3, M1     | S2, S4     | B2, M3      | (b)     | B2, M8                 | 3                           |
| A3     | 3        | 7             | N5             | —          | —           | (e)     | N4                     | 10                          |
| A4     | 5        | —             | M4             | —          | N14         | (c)     | M6, M7                 | 2, 22                       |
| A5     | —        | —             | M3             | S3         | M2          | (f)     | —                      | —                           |
| A6     | 4        | —             | —              | —          | M17         | (d)     | —                      | 18                          |
| A7     | 6        | 5             | M7, N1, N2     | —          | N11, N15    | 6       | B3, M10, N2            | 4                           |
| A8     | 10       | —             | —              | —          | —           | —       | M3                     | 1, 14, 20                   |
| A9     | 7        | 3             | N4             | S6         | M4          | (g)     | B4                     | 7                           |
| A10    | 8        | 4             | M6             | S6         | —           | (g)     | M1, M2                 | 8, 25                       |
| A11    | —        | 10            | —              | —          | M10         | —       | M11-M13                | 12, 13                      |
| A12    | —        | —             | —              | —          | —           | —       | M9                     | 9                           |
| A13    | —        | 8             | —              | S8         | M12         | yes     | M3                     | —                           |
| A14    | 9        | 12, 13        | M1, M2, N3, N6 | —          | M9, M14, N9 | (g)     | M5                     | —                           |
| A15    | —        | —             | —              | S5         | M1          | yes     | —                      | —                           |
| A16    | 11       | —             | —              | S7         | M8, M16     | yes     | M16                    | —                           |
| A17    | —        | —             | —              | S7, S9     | N4          | —       | —                      | —                           |
| A18    | —        | —             | —              | —          | N16, N17    | —       | M4, N1, N3, N5, N7, N9 | 5, 6, 11, 15-19, 21, 24, 27 |
| A19    | —        | —             | —              | —          | —           | —       | M15                    | —                           |

## Recommended order

1. Commit the spike document (A13).
2. Redraft FeatureRange: A1-A7, A14-A17, nits.
3. Redraft DetailedRange: A8-A12, A18, A19; commit 4 and 5 shrink (no matcher change, no `TargetModel.text`).
4. Re-run `egm-review` consolidated.
