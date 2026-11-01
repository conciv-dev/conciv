# Comprehension Report (round 2)

**Target:** `/Users/omrikatz/Public/web/aidx-text/docs/superpowers/specs/2026-11-01-design-text-layer.md` (FeatureRange 1-219, DetailedRange 220-352)
**Reviewer:** egm-comprehension. All of the target and the persona file were read; no document standard applies. Code under `packages/extensions/design/src` was read to check claims, without changing anything.

## What this proposes

The design extension compares a designer's PNG with a 1x Chromium capture of the live page, tile by tile. Today, identical text drawn by different rasterizers still produces pixel differences, which cause false findings. The change has three steps. First, the foreground color estimator is fixed: it samples "ink" (pixels further from the background than `colorDeltaE`) instead of anti-aliased edge pixels, and returns null when there is no ink. Second, text is read from the DOM for live components (one run per line, with its string) and once per target by a vendored PaddleOCR model running on `onnxruntime-web` wasm. Runs are grouped per live component; a group "agrees" when the two joined strings match after case folding and whitespace collapsing. The boxes of agreeing groups (for the component and all its descendants, on both sides) count as equal pixels in the tile mismatch, and the denominator is unchanged. Third, a group that disagrees keeps its pixels and adds a `text` delta with both strings. Text that only one side has, and targets stored before this change, behave exactly as today.

## How the existing system works, per this document

`design_target` loads an image into a raster and a single root node, runs enrichers on it, and stores the result as the target model. `design_diff` captures the live page together with its `LiveComponent` records (elements that have `data-conciv-source`). The tile matcher then pairs components with target boxes from the top down, computing each tile's blurred pixel mismatch with blazediff and descending into children only at or above `tileGate`. Delta kinds are measured from per-side styles for pairs at or above the gate. A pair stays in the report only if it has deltas or no reported children. `design_status` returns `done` when no component is above tolerance and nothing is unmatched.

## Findings

1. **Blocker. CUJ 3 (76-78), Goal 3 (46), Steps 4-5 (115-129), item 5 (243), gate (224).** Agreement depends only on the strings. A label recolored from `#ffffff` to `#ffd166` with the same text forms an agreeing group, so its glyph boxes (plus halo and `blurRadius`) count as equal pixels. Nothing else in the button differs, so the tile falls below `tileGate`. Delta kinds only run on pairs at or above the gate (code: `tool/steps/diff.ts:185`), so no `foreground` delta can be produced. This is the same false negative used to reject Alternative A (40, 156). The `text-recolor` test added in commit 1 would start failing at commit 4, which breaks the gate of "all tests pass after every commit". The document does not say how a recolor survives the mask, so the Overview and CUJ 3 cannot be reconciled with Step 5.

2. **Major. Step 4.1 (119), item 21 (297), item 23 (303), Data flow (144-145).** Groups are computed "once per diff, before the tile pass", but runs are translated by the matcher's `targetBox - liveBox`. Item 21 takes `pairs`, yet item 23 builds the groups before calling the matcher, so no pairs exist at that point. Every component then falls back to the "not yet paired" case, which means no translation is ever applied. Meanwhile the matcher's target boxes depend on mismatch, and mismatch depends on the groups. The document should state the order (iterative, two-pass, or always untranslated).

3. **Major. Risks (192) vs item 19 (289).** Risks says OCR failure "is reported by the tool as an `ocr-failed` error". Item 19 says the error is "logged, not thrown". `TargetResultSchema` (`shared/defs.ts:105`) has no field for warnings, so the agent calling the tool never learns that OCR failed and that this target will never be masked. Say where the user sees it.

4. **Major. Risks, Memory (196).** It says concurrent `design_target` calls are serialized through "the store's existing write queue". In the code, that queue only wraps `replace` inside `store.put` (`server/store.ts:152`). The OCR call (item 19) runs before `put`, outside the queue. Either concurrent reads share the singleton session, which is unaddressed, or the plan has to move OCR into the queue.

5. **Major. Step 1 (96), items 1-4 (231-240).** The statement that this "fixes consequence 1 for every caller (`sideStyles`, `colorAgrees`)" does not match the code. `colorAgrees` (`matchers/tile.ts:65`) reads only `background`, never `foreground`, so item 4 has nothing to change. `foregroundColor` has a third caller, `server/enrichers/color.ts:13`, which no plan item touches. Changing its return type to `string | null` will fail typecheck there, or change target-node colors without anyone deciding to.

6. **Major. Step 4.1 (119), group ownership.** Target runs are assigned by overlap and are not exclusive. One OCR box that spans two adjacent labels (for example `Export Share`) overlaps both buttons' glyph boxes by more than half of the smaller box. Both groups then disagree, which produces false `text` deltas and leaves the pixels unmasked. The same run can also be claimed by a parent and a child that both have direct text. The document does not say whether a run can belong to more than one group, or how a run that spans components is handled.

7. **Major. Step 2, live side (100) vs item 8 (254).** "The text nodes it paints itself (direct text-node children, not descendants that are components)" can be read two ways. Is text inside a descendant element that is _not_ a component (a plain `<span>`, or library DOM without `data-conciv-source`) included? "Direct text-node children" says no; "not descendants that are components" suggests yes. The answer decides how much rasterization noise remains.

8. **Major (still open from round 1). Lines 28, 107, 109, 209, 343.** The evidence (recall figures, "28 renders", box error) and the code being ported (`wasm-service.ts`, `trim.ts`) live in a spike file that is created only in commit 6, "copied from the session scratchpad". A reader of this draft cannot open it. Step 3's "builds the platform object the way the spike does" and "assigns the detection and recognition sessions it creates" can only be understood with that file.

9. **Nit. Step 3 (105) vs `shared/types.ts:84`.** The `TextReader` slot "exists", but its current signature returns `{text, boxes}`. Item 7 silently changes it to `TextRun[]`. Say that it changes.

10. **Nit. CUJ 1 (64) vs item 26 (312), Verification (349).** CUJ 1 says the raw difference is "asserted by the test", but item 26 skips the test when the precondition fails. A precondition that skips is not an assertion, and CI could pass on a skip. State which one is intended.

11. **Nit. Item 24 (306), still open from round 1.** The document does not explain why a `TEXT_NOISE` text shadow stands in for a different rasterizer. It also does not say whether the shadow's spread stays inside halo + `blurRadius`.

12. **Nit. Risks, tall targets (195).** "Bands of at most 1280px": the overlap size and the "deduplicating by overlap" rule are not given. The 0.3s figure (107, 203) does not account for multiple bands.

13. **Nit. Goal 5 (48).** "Consumed as exported, at 1x" is unclear: the adapter already scales any export to the route width (`adapters/image.ts:37`). Does the goal mean "no upscaling for OCR", or "2x exports are unsupported"?

14. **Nit. Undefined terms.** "Component gate" (11, presumably `tileGate`); "ppu" (109, 193, 351, shorthand for `ppu-paddle-ocr`); "the server's shutdown hook" (113, 286; the code has `dispose` in `server.ts`); `u1-1280` (292); "28 renders" (107); `Side` (133); `@conciv/it` and `fallow audit` (224). Issue #659 and PR #650 have no links.

15. **Nit. Pair definition (24).** It says descent happens only on mismatch at or above `tileGate`. The code also requires matching geometry and `colorAgrees` (`tile.ts:109-114`). CUJ 4 depends on this: the header's background differs, so the matcher never descends into the buttons.

## Round 1 comparison

Fixed: the old-target Blocker (one-sided runs stay in pixels; CUJ 5), core terms defined (Terms list), the coordinate space (1x CSS pixels), the own-mismatch ordering (removed), descendant scope of the ignore list, enricher ordering, commit grouping and the gate, tool names, case folding (now a stated blind spot), CUJ 2's change in width (fixed-width button), and the version pins. Still open: the spike can't be read (8) and the text-shadow rationale (11).

## Verdict

Not self-contained, and inconsistent with itself in one place. One Blocker: CUJ 3 and Goal 3 cannot be met under Step 5 as written. Seven Majors.
