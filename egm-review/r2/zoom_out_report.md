# Round 2: Zoom Out Report

**Target:** `/Users/omrikatz/Public/web/aidx-text/docs/superpowers/specs/2026-11-01-design-text-layer.md` (lines 1-352; FeatureRange 1-219, DetailedRange 220-352)
**Reviewer:** egm-zoom-out. Status: completed.
**Verdict:** does not pass. The objective is clear, so context sufficiency passes. The architecture is now right: mask only text both sides agree on, fix `foregroundColor` in place, keep the mismatch denominator. One blocker remains.

## Round-1 items resolved (not re-reported)

- **A1:** only agreed text is masked; the empty-string branches are gone. The colour gap is the blocker below.
- **A2:** `foregroundColor` is fixed first and can ship alone.
- **A3:** `ownMismatch` is dropped and the denominator kept.
- **A7:** the offset argument is removed and listed as a blind spot.
- **A9:** a Risks section exists.
- **A12:** terms are defined.
- **A4, A5, A11:** largely addressed in the detailed plan.

## Findings

### 1. Blocker: string-only agreement masks recolours, so CUJ 3 cannot pass

**Scope:** Step 4.3 (line 121), Step 5 (line 127), Goal line 46, CUJ 3 (lines 74-78), the Alternative B rejection (line 163), plan item 5 against commit 4 (item 26).

**Rationale:**

- In CUJ 3 the live label is `Export` in `#ffd166` and the target says `Export` in `#ffffff`. The joined strings are equal, so the group agrees.
- Step 5 then ignores its boxes on both sides, grown by the halo and `blurRadius`. The button's mismatch falls below `tileGate`.
- The pair is never reported (`diff.ts:185`, `tile.ts:111`), so no `foreground` delta is measured.
- The `text-recolor` test added in commit 1 will pass at commit 1 and fail at commit 4.
- The consolidated A1 claimed "a changed or recolored label keeps its pixels". That holds only for changed text, not for colour.
- This also undoes the advantage line 161 credits to Alternative B ("a recolored glyph still shows"). The OCR agreement test is weaker than B on colour.

**Recommendation:** make agreement mean equal strings **and** glyph ink colour within `colorDeltaE`. Measure ink colour with the Step 1 estimator over the group's boxes on each side. This reuses Step 1 and adds no new constant. State it in Step 4, Step 5 and the plan for item 21.

### 2. Major: the Step 4 translation is circular, dead and not needed

**Scope:** line 117 vs line 119, Step 5 (line 127, "translated into the live frame"), item 21 (`pairs` input), item 23.

**Rationale:**

- Groups are computed "once per diff, before the tile pass" and passed to the matcher (item 23). The matcher is what produces `targetBox`, so no component is paired yet when grouping runs. The translation by `targetBox - liveBox` is therefore always zero, and `pairs` is an input that cannot exist at that point.
- It is also unnecessary. `tileMismatch` crops the same `box` from both rasters (`tile.ts:43-48`), so pixels are compared in one shared frame, and the masks should be in that frame too.

**Recommendation:** delete the translation, the "not yet paired" clause and the `pairs` parameter. Target runs are used at their own coordinates.

### 3. Major: the live side re-derives text the capture already has

**Scope:** Step 2 live side (line 100), items 7, 8 and 10 (lines 251-260), Step 4.2 (live join).

**Rationale:**

- `client/components.ts` already has `ownTextNodes(el)` (direct text-node children, the same as the proposed `glyphNodes`).
- `LiveComponent.text` is already the component's own text joined in DOM order.
- The new parts are per-line boxes from `Range.getClientRects()`. The proposed per-rect substring split ("walking offsets until the rect changes") and the live-side reading-order join only rebuild a string that already exists.

**Recommendation:**

- Make `glyphs` a `Box[]` (one per client rect of `ownTextNodes`, halo applied).
- Compare `component.text`, with whitespace collapsed and case folded, against the joined target runs.
- `TextRun` stays only for the target side.
- This removes the offset walk, the per-node substring logic and half of Step 4.2.

### 4. Major (carried over, not refuted): a parallel `TargetModel.text` beside a tree that already models text

**Scope:** Terms (line 22), Step 2 target side (line 101), items 7, 12 and 13.

**Rationale:**

- `TargetNode` already has `kind: 'text'`, `text` and `box`, and `TargetNodeSchema` persists them (`store.ts:27-51`).
- The image adapter yields a root with `children: []`, so old targets already load with no text and need no default.
- Round-1 zoom-out finding 3 raised this. The consolidation dropped it rather than resolving it.
- A separate `text` field is a second text source that the Figma follow-up (Non-Goal, Alternative F) would have to merge with real text nodes.

**Recommendation:** store OCR runs as `kind: 'text'` children of `root`, appended after `enrich` as Step 2 already orders it, so the colour enricher does not run on them. This drops the `ModelSchema` change, the `TargetModel.text` field and item 12.

### 5. Nit: one page mask instead of per-component descendant ignore lists

**Scope:** Step 5 (line 127), item 22, item 1 (`boxMask`).

**Rationale:**

- "Agreeing boxes of the component and all its descendants" means walking descendants for every pair.
- It also misses agreeing text of neighbours that falls inside the `tileMargin` (8px) border of the tile.
- Separately, a box-to-mask fill loop already exists as `zeroed` in `unmatched.ts:16-27`. Copying `boxMask` from the parked branch duplicates it.

**Recommendation:** build one page-sized mask from all agreeing boxes once per diff, reusing or generalising `zeroed`. `tileMismatch` then crops it with the tile. `Matcher.match` takes that mask instead of `groups`.

### 6. Nit: the Step 1 caller list is wrong in both directions

**Scope:** line 96, items 1-4.

**Rationale:**

- `colorAgrees` reads only `.background` (`tile.ts:69`), so item 4 changes nothing.
- `enrichers/color.ts:13` does call `foregroundColor` and stores the result in `TargetNode.fills.foreground?: string`. The new `string | null` return breaks that type, and the file is not in the plan.
- `fills` is read nowhere.

**Recommendation:** drop item 4. Either map `null` to `undefined` in the enricher, or delete the enricher's `foreground` field.

### 7. Nit: OCR outcome in Risks contradicts the plan

**Scope:** line 192 vs item 19.

Risks says the tool reports `ocr-failed`. Item 19 says it is logged, not thrown, so the agent never sees it. Pick one. Logging is the lazier choice, and it is acceptable because the fallback is today's behaviour.

### 8. Nit: two mitigations rely on things that do not exist

**Scope:** lines 194 and 196.

- **Size limits:** "the existing adapter's size limits apply" is wrong. `adapters/image.ts` decodes any PNG with no size check.
- **Write queue:** the store's write queue (`store.ts:98-153`) only serialises the write in `put`. OCR runs before `put`, outside the queue, so concurrent `design_target` calls reach the singleton session at the same time.

**Recommendation:** either state the gaps, or add a one-line promise chain in the reader and a pixel-count cap.

### 9. Nit: band slicing is an unmeasured mitigation

**Scope:** line 195, item 18.

Slicing, merging and deduplicating overlapping bands is new logic that no CUJ or test covers, and the spike did not measure tall pages. Either add one tall-target measurement or test, or defer slicing with a stated ceiling (recall drops above about 2000px).

### 10. Nit: altitude drops in the FeatureRange

**Scope:** line 109 (`createRequire`, ppu-ocv class names, OCR options) and line 100 (the offset walk).

This is package-internal construction detail. Item 18 already covers it, so the Technical Plan can say "the reader loads ppu's core over `onnxruntime-web` with vendored models, pinned exactly; see item 18".

### 11. Nit: the case against Alternative B is asserted, not measured

**Scope:** line 162.

The claim that ink overlap "cannot distinguish `Export` from `Expert`" is the only argument for B's weakness, and the spike measured OCR engines, not B. The `text` delta (Goal, CUJ 2) now justifies the dependency on its own. Either drop the claim or back it with a number.

## Checked and fine

- **Step 1:** foreground from ink, `null` when no ink, shipped alone first.
- **Masking:** ignored pixels count as equal over the full tile area; `tileGate` is unchanged.
- **One-sided text:** placeholders, icon fonts, OCR misses and old targets fall back to pixels, which makes Non-Goals line 54 and CUJ 5 true.
- **`text` delta:** computed in the diff step from the group, outside the `Side`-based `DeltaKind` registry. That is reasonable, since target `Side` carries no text.
- **Single-value `text` config enum:** follows the existing `geometry`, `color`, `capture` and `matcher` pattern.
- **Cross-renderer test:** has a raw-mismatch precondition, so it cannot pass vacuously.
- **Real Figma export:** required before release.
