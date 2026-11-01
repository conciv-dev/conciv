# Stage 6: Comprehension Report

**Target:** `docs/superpowers/specs/2026-11-01-design-text-layer.md` (FeatureRange 1-187, DetailedRange 188-341)

| Reviewer            | Status    |
| ------------------- | --------- |
| `egm-comprehension` | completed |

### What this proposes

The design extension compares a designer's PNG with a live Chromium capture of the page. Today glyph rasterization differences show up as pixel mismatch, which causes false findings. The proposal splits text into its own layer. On the live side, the client collects per-component "glyph runs" (text-node client rects plus the text) from the DOM. On the target side, a WebAssembly PaddleOCR reader runs once at `design_target` and stores "text runs" in the target model. In the pixel diff, the union of both sets of boxes becomes an ignore list. Ignored pixels are removed from both the numerator and the denominator, so `tileGate` keeps its value. Containers get an "own mismatch" that excludes reported children. A new `text` delta compares the reading-order-joined strings of matched groups, with whitespace collapsed and case folded. The `foreground` color is sampled from eroded glyph cores. `design_status` becomes `done` when no component's own mismatch is above tolerance and no delta is open.

### How the existing system works, per this document

For each route and width, the extension stores a target image that an adapter loads into a raster and a "node tree", then enriches (for example with colour). `design_diff` captures the live page together with component records. A tile matcher pairs live components with target boxes and computes a pixel mismatch per tile using blazediff. Delta "kinds" (geometry, colours and others) are measured from per-side styles and mapped to CSS provenance. The report keeps a component if it has deltas or has no reported children. A shared `componentAboveTolerance` rule and an "x-ray" view decide what counts as above tolerance. `TextReader` already exists as a null slot in the comparators.

Could not paraphrase: how a node tree comes out of a PNG; how live components are paired with target nodes.

### Findings

1. **Blocker.** Rollout (line 172) vs ignore list and text-delta rules (94, 102, 252, 267, 282). A pre-existing target with no runs is said to be compared "by pixels as today", but live glyph boxes are still masked and "live text with no target text" yields a `text` delta with `target: ''`. Every label on an old target would produce a false text delta and its pixels would not be compared. No plan item guards "target has no runs".
2. **Major.** Lines 23, 132, 39. Alternative A rejected for losing a 4px card move visible only through text; this design ignores the same pixels and compares strings only. Which mechanism catches the move is never stated; line 39 lists text-only shifts as a blind spot, cancelling the rejection reason. "The existing breakpoint test" (132) is undefined.
3. **Major.** Coordinate spaces (32, 79, 94, 102). Live rects "rounded out to whole device pixels"; target read "at 1x". Never stated that both sides share a coordinate space, what the capture DPR is, or how a live box projects into target space when the pair's target box is offset.
4. **Major.** Undefined core model: component, node tree, pair, "pair's target box", tile, reported vs above tolerance (11, 20, 80, 94, 100, 102).
5. **Major.** Own-mismatch evaluation order (96, 267, 282): reported children depend on the filter, which uses own mismatch. Bottom-up recursion implied, never stated.
6. **Major.** Ignore-list scope (94, 257): does a container's ignore list include its child components' glyph boxes? If not, child label noise inside a container's tile is masked only by OCR runs (3px median edge error, recall 97/98). CUJ 1 depends on the answer.
7. **Major.** OCR misses vs zero-delta claims (27, 53, 88, 102): 97/98 recall, a missing target run becomes a `text` delta with `target: ''`. Nothing says what happens when OCR misses or misreads.
8. **Major.** Enricher ordering (80, 120, 247, 302): reader after enrichers in the overview, but item 22 needs runs inside the color enricher; order undecided, not in Open Questions.
9. **Major.** Line 190 "Seven commits": 27 items never grouped; "gates" undefined.
10. **Major.** Lines 40, 176-177: "the spike" evidence and the code to port live in a session scratchpad under `/private/tmp`, unreachable to any other reader.
11. **Major.** Line 334: acceptance test "must fail with the ignore list disabled", but no way to disable it exists (no flag, no constant).
12. **Major.** Lines 21, 52, 71, 112: `design_status`, `design_target`, `design_diff`, "done", "open", "a delta is open" never introduced or defined.
13. **Nit.** Line 102: case folding means `Export` to `EXPORT` yields no delta, against line 28.
14. **Nit.** Undefined constants and terms: `tileGate` meaning, `blurRadius`, `colorDeltaE`, "component gate", "x-ray", "the three agree", `Side`, "ppu", `ppu-ocv`, `strategy: 'per-box'`, "no sharp", `fallow audit`, `@conciv/it`.
15. **Nit.** Line 59, CUJ 2 "Nothing else is reported": `Download` is wider than `Export`; why no geometry delta appears is unexplained.
16. **Nit.** Line 312: why a sub-pixel `textShadow` simulates a different rasterizer is not given; "a fourth target" (317) assumes knowledge of the three.
17. **Nit.** Lines 304, 335: item 23 leaves the file open; Storybook step conditional though items 17 and 23 always change the x-ray.
18. **Nit.** Line 197: `onnxruntime-web` unpinned while `ppu-paddle-ocr` pinned, with no reason for the difference.

### Verdict

Not self-contained. One Blocker (rollout contradicts masking and text-delta rules), eleven Majors.
