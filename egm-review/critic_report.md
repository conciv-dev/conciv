# Stage 7: Critic Report

**Target:** `docs/superpowers/specs/2026-11-01-design-text-layer.md` (FeatureRange 1-187)

| Reviewer         | Status    |
| ---------------- | --------- |
| `egm-design`     | completed |
| `egm-structural` | completed |
| `egm-style`      | completed |

## Blockers

### B1. Text comparison sits behind the pixel gate this design removes text from (design)

Lines 94-102, 112; CUJ 2, CUJ 3. Deltas are measured only for pairs with `mismatch >= tileGate` (diff.ts:185) and the matcher descends into children only when the parent is at or above the gate (tile.ts:108-115). With glyph pixels ignored, a button whose only change is its label or label color has mismatch about 0; the pair is never created or never reported; `textDeltas` and the glyph-core estimator never run. Recommendation: text comparison runs on every live component with glyph runs against the target runs regardless of pixel mismatch, or descent and reporting also trigger on text or ink disagreement; define `reported` and status in those terms.

### B2. Eroded glyph boxes are not glyph cores (design)

Lines 79, 106-108; Goal 3, CUJ 3. `Range.getClientRects()` yields line boxes (17px tall for a 16px font, including leading and inter-letter gaps); trimmed OCR runs are still whole-word bounding boxes. Eroding by 1px leaves mostly background; a median returns the background color on both sides. A recolored label gives no `foreground` delta and a background change is misreported as foreground. Not measured by the spike. Recommendation: pick ink pixels by contrast against the box's background (two-cluster split, or ΔE from the border mode); measure on the `text-recolor` fixture before relying on it.

### B3. OCR-readable text that is not a DOM text node yields false `live: ''` deltas (design)

Lines 38, 79, 102; CUJ 1. Placeholders (`Search invoices` on the existing fixture, which the spike had to special-case), input values, `::before`/`::after` content, SVG `<text>`, canvas text, text inside `<img>` all become false `text` deltas under the line 102 rule. Line 38's "falls back to pixel comparison" has no mechanism: the OCR run lands inside the img pair and goes on the ignore list. Icon-font ligatures yield the reverse false `target: ''`. Recommendation: collect placeholders, input values and pseudo-element content on the live side; define boxes where no live text is possible (img, svg, canvas, icon-font nodes by font family or private-use codepoints) and suppress target runs inside them.

## Major

### M1. The design keeps the false negative it uses to reject Alternative A (design, style 10)

Lines 23, 39, 94, 129-133. A card moved 4px visible only through text: both positions masked, group match still pairs a 4px shift on a 17px line, strings equal, no delta. Recommendation: compare matched group offsets against the pair's live-to-target offset and emit a geometry delta, or widen the non-goal and drop the rejection reason.

### M2. Rollout claim for old targets is false under the design's rules (design, style 3)

Line 172 vs 94, 102, 112. An old target has no runs; live glyph boxes are still ignored and every component with text gets a `target: ''` delta. Recommendation: when the model has no runs, skip text deltas and live-glyph masking, or re-read on load. Scope line 112's absolute claim to targets with runs.

### M3. The evidence never touches the stated problem (design)

Lines 15-21, 88-90, 167-172. Every spike image is a browser rendering the same fixture HTML; the acceptance test is Chromium again. Designer exports bring font substitution and text placed a few pixels away from the DOM run, which breaks the half-overlap grouping. Target size and PaddleOCR's long-side resize are unaddressed. Recommendation: one real Figma export in the evidence; state the maximum target size and resize behavior or tile tall images.

### M4. Target runs and live glyphs compared without coordinate conversion (design)

Line 102. For a pair whose `targetBox` differs from `liveBox`, its target runs sit away from its live glyphs and may overlap another pair's glyphs. Recommendation: translate target runs by `targetBox - liveBox` before grouping; define "other pair" as any live component.

### M5. No Risks & Mitigations section (design, structural 1)

Required by the standard. Unaddressed: OCR misreads with no confidence floor and no way to turn the layer off (`text` config accepts only `paddle`); ppu file-path import fragility with no failure behavior; `design_target` when OCR throws or wasm fails to load; decoding untrusted PNGs in native `@napi-rs/canvas` with no size limit; memory of the lazy singleton and concurrent `design_target` calls. Recommendation: add the section; add a `text: 'none'` config value or per-target opt-out.

### M6. Removing text from the denominator destabilizes small or text-heavy tiles (design)

Line 94. A chip whose grown glyph boxes cover most of its tile leaves a handful of pixels in the denominator; one noisy pixel crosses `tileGate`. Recommendation: define behavior below a minimum unmasked area, or argue it cannot happen at `tileMargin`.

### M7. Evidence lives in a session scratchpad (structural 2, style 8)

Lines 176-177. All measured claims point to `/private/tmp/claude-501/...`. Recommendation: commit `results.md` and the port sources to the repo or attach to #659, and link there. Define "spike" at first use.

### M8. Internal contradictions in wording (style 1, 2, 5, 6, 7, 9)

- Line 102 "No numeric threshold" while the paragraph uses two half-overlap thresholds; narrow to "no string-similarity or confidence threshold".
- Line 88 "no postinstall script" vs line 169 "beyond `@napi-rs/canvas`'s prebuilt selection".
- Line 150 "never reads the labels (86.7% recall)" conflates overall recall with the label result.
- Line 88 "97/98" ambiguous; spell out.
- Line 63 "visibly different hue" is unmeasurable; tie to `colorDeltaE`.
- Line 15 "Figma, Sketch or another OS" is a category error.

### M9. Terminology drift (style 4)

Lines 79-122: glyph runs / TextRun / live glyph boxes / live boxes / glyphs; text runs / target runs. Use the defined terms.

## Nits

- Open question (43-45) already answered: ppu downloads models from huggingface by default; vendor them; note the model license. (design N1, zoom-out)
- Spike trim uses `sharp().trim({threshold: 40})`: a tuning constant; name it. (design N2)
- "Worker threads are on" vs the spike's 1-thread recommendation; state the count and reason. (design N3)
- Status rule (112) omits `unmatched`; page-level mismatch and the diff image still include text noise; say whether they stay raw. (design N4)
- Case folding hides `EXPORT` vs `Export`; ellipsis and line-clamp truncation give false text deltas; list as blind spots. (design N5, style)
- Florence-2 "3 to 6 seconds" is 2.1 to 5.9s whole-image, 15s tiled. (design)
- Structure: Additional Resources and Future Improvements nested under NFRs as H3; Open Questions placed between Non-Goals and CUJs; "PR 650" vs "PR #650"; `ppu-ocv` appears only in Future Improvements; "commits reused where noted below" points outside the range. (structural)
- Wording: "Text breaks that" antecedent; "a CSS fix that would make the page worse"; "tolerance" never tied to `tileGate`; "small native prebuilt" unquantified; "trimmed afterwards"; `blurRadius` undefined; "the three agree"; line 100 convoluted; "regularly spans"; British "neighbouring"; unnamed tests at 132 and 150; "cheaper", "drop-in" unqualified; "hallucinations"; unnamed env var at 156; "at all"; "a few MB"; line 172 vague; line 183 "file-path construction" unexplained in range. (style 11-28)
