# Consolidated Review Report

**Target:** `docs/superpowers/specs/2026-11-01-design-text-layer.md`
**Mode:** uninterrupted, all rubrics. Stage reports in this directory: `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `intermediate_zoom_out_report.md`, `implementation_readiness_report.md`.

| Stage                      | Reviewers                                                     | Status    |
| -------------------------- | ------------------------------------------------------------- | --------- |
| 5 Zoom Out                 | egm-zoom-out                                                  | completed |
| 6 Comprehension            | egm-comprehension                                             | completed |
| 7 Critic                   | egm-design, egm-structural, egm-style                         | completed |
| 8 Intermediate Zoom Out    | egm-zoom-out                                                  | completed |
| 9 Implementation Readiness | egm-implementation-readiness, egm-codebase-details, egm-style | completed |

**Verdict:** the document does not pass. The design has one root defect that produces most blockers, and the plan is not executable without design decisions. Stage 8 shows the root fix is a simplification, not more machinery.

## Action items

### 🔴 Blockers

**A1. Mask only text both sides have and agree on.** Replace unconditional masking of all glyph boxes and all target runs with: group live glyph runs and target runs once per diff (target runs translated by `targetBox - liveBox`); only groups whose normalized strings are equal go on the ignore list; everything else stays in pixels. Delete the `live: ''` / `target: ''` delta branches. A changed or recolored label then keeps its pixels, trips the existing gates (tile.ts:111, diff.ts:185) and the existing pair/delta path runs; the `text` delta explains the mismatch. Old targets (no runs), OCR misses, placeholders, pseudo-elements, icon fonts, text in images all fall back to pixels, which makes lines 38 and 172 true as written.
Sources: zoom-out 1; comprehension 1, 7; critic B1, B3, M2, M4, M5(part); zoom-out-8 1; readiness B3, B4, B5, B6; codebase B1, M12.

**A2. Fix `foregroundColor` in place.** `raster.ts:151-155` medians Sobel edge pixels, which are anti-aliased blends by construction. Pick pixels by ΔE from the background median already computed (cutoff `colorDeltaE`), reuse the parked branch's `glyphCoreColor` shape (ΔE mask, erode, `null` when empty). Fixes every caller (`sideStyles`, `textLeaf`, `colorAgrees`) without glyph boxes or OCR. Can ship first, alone.
Sources: critic B2; zoom-out-8 4; readiness M6; codebase B2, B3.

**A3. Drop `ownMismatch` and keep the mismatch denominator.** Once agreeing text is masked the buttons fall below `tileGate`, the header has no reported children, and the existing filter keeps it with `deltas: []` (CUJ 4). Count ignored pixels as equal over the full tile area; no minimum-area constant, no schema field, no circular definition, no broken stored results.
Sources: zoom-out 5; comprehension 5; critic M6; zoom-out-8 2, 3; readiness M3, M4, M12; codebase M6, M9.

**A4. Make the reader loadable and fully specified.** ppu's `exports` blocks deep imports; name the resolution (`import.meta.resolve`/`createRequire` on `ppu-paddle-ocr/package.json` plus the `core/` path), tsdown `external`s; add `ppu-ocv` 4.0.0 to catalog and dependencies; describe the platform object the spike builds (ppu-ocv `Canvas`, `CanvasProcessor`, `CanvasToolkit`, `ImageProcessor`, `Contours`, `cv`; `ImageProcessor.initRuntime()`; sessions assigned by hand); `minimumConfidence: 0`; `numThreads: 1`; input = `encodePng` bytes to `recognize(bytes, {flatten: true, noCache: true})`; box field mapping; `models/` unconditional with the three file names, source, checksum and license; pin `onnxruntime-web` 1.31.1 and note the second copy via `apps/site`; trim algorithm (corner background, distance, threshold 40, `< 2px` skip) with the constant named in `tolerances.ts`.
Sources: zoom-out 7; critic N1, N2, N3; readiness M1, M2; codebase B4, M1-M5.

**A5. List every file and group into commits that each build.** Add `server/captures/tab.ts`, `server/adapters/image.ts`, `server/deltas.ts`, `matchers/tile.ts` `colorAgrees`, `xray/dev-fixture.ts`, `xray/list.tsx` (`KIND.text`), `xray/fix-prompt.ts`, `registries/delta-kinds.ts` note, IT `mapFixture` literal. Name the seven commits with item numbers and the gate after each. Drop item 7 and item 22. Fix item 23 to `list.tsx`.
Sources: zoom-out 4, 10; comprehension 9; readiness B1, B2, M5, M8; codebase M7, M8, M14, M17; style.

### 🟡 Major

**A6. Give `textDeltas` a real contract.** Signature receives the live component tree and all target runs (or the per-diff grouping from A1); exclusion set = glyphs of all live descendants; "inside" defined; `targetBox === null` behavior; wrapped text: attach the string to the first rect or split by `Range` per line.
Sources: readiness B4; codebase M12, M13.

**A7. Remove the 4px-move argument.** OCR edge error (3px median, 8px max) makes an offset check unworkable; keep the blind spot in Non-Goals and drop the 4px card from line 23 and the rejection of Alternative A.
Sources: zoom-out 2; comprehension 2; critic M1; zoom-out-8 5.

**A8. Reframe OCR's role and defend it against Alternative B.** OCR is the agreement test that lets target-side text be masked, plus readable `text` strings; argue it against B's ink-overlap test, not as the centerpiece. State label-change detection as a requirement with a real case, or as a benefit.
Sources: zoom-out 6; zoom-out-8 6.

**A9. Add `## Risks & Mitigations`.** OCR misread on real exports; reader or wasm failure at `design_target` (falls back to no runs under A1); ppu internals pinned by file path; untrusted PNG decode in `@napi-rs/canvas` with no size limit; singleton memory and concurrent registrations; target size and PaddleOCR long-side resize.
Sources: critic M5; structural 1; codebase M2.

**A10. Evidence out of the scratchpad; one real Figma export.** Commit `ocr-spike/results.md` and the two port sources under `docs/` or attach to #659; add one designer export to the measured set.
Sources: critic M3, M7; structural 2; comprehension 10.

**A11. Fix fixtures and CUJ 2.** Cherry-pick 4e5c87adf (`TEXT_NOISE`, `TARGET_ALIASES`, three tests); alias `text-changed` and `text-recolor`; name the recolor color above `colorDeltaE` and the button; fixed button width or drop "nothing else reported"; `u1-1280-plain` path; assert the plain target differs from the normal one on raw button mismatch before relying on the cross-renderer test; replace "fail with the ignore list disabled" with a runnable check or remove it.
Sources: critic N5; comprehension 11, 15; readiness M9, M10, N1; codebase M15, M16, N1; style 6, 7.

**A12. Define terms and fix contradictions.** Component, pair, tile, node tree, reported vs above tolerance, `design_target`/`design_diff`/`design_status`, "open"; coordinate space and DPR; "No numeric threshold" vs half-overlap rules; postinstall wording; 86.7% vs "never"; 97/98; "visibly different hue"; "Figma, Sketch or another OS"; term drift (glyph runs / text runs / `TextRun`); case folding and truncation as blind spots; `unmatched` in the status rule; page-level mismatch stays raw.
Sources: comprehension 3, 4, 12, 13, 14; critic M8, M9, N4, N5; style.

### 🟢 Nits

Structure (Additional Resources and Future Improvements as H2; Open Questions placement; issue/PR reference form; `ppu-ocv` introduced at first use); readers folder under `comparators/`; `Row.ownMismatch` nullability if kept; singleton `destroy()` and vitest exit; Storybook step pointless; wording list in the stage reports.

## Traceability

| Action | Stage 5 | Stage 6     | Stage 7        | Stage 8 | Stage 9                                  |
| ------ | ------- | ----------- | -------------- | ------- | ---------------------------------------- |
| A1     | 1       | 1, 7        | B1, B3, M2, M4 | 1       | rB3-B6, cB1, cM12                        |
| A2     |         |             | B2             | 4       | rM6, cB2, cB3                            |
| A3     | 5       | 5           | M6             | 2, 3    | rM3, rM4, rM12, cM6, cM9                 |
| A4     | 7, 8    |             | N1-N3          | 7       | rM1, rM2, cB4, cM1-M5                    |
| A5     | 4, 10   | 9           |                |         | rB1, rB2, rM5, rM8, cM7, cM8, cM14, cM17 |
| A6     |         |             |                |         | rB4, cM12, cM13                          |
| A7     | 2       | 2           | M1             | 5       |                                          |
| A8     | 6       |             |                | 6       |                                          |
| A9     |         |             | M5, s1         |         | cM2                                      |
| A10    |         | 10          | M3, M7, s2     | 7       |                                          |
| A11    |         | 11, 15      | N5             |         | rM9, rM10, cM15, cM16                    |
| A12    |         | 3, 4, 12-14 | M8, M9, N4, N5 |         |                                          |

## Recommended order

1. A2 as its own small PR on main (no OCR, fixes #659 consequence 1).
2. Redraft the design with A1, A3, A7, A8, A9, A12; then the plan with A4, A5, A6, A11.
3. Re-run `egm-review` on the redraft.
