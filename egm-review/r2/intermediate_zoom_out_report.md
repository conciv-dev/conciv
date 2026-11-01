# Intermediate Zoom Out (Stage 8): 2026-11-01-design-text-layer.md

**Target:** `/Users/omrikatz/Public/web/aidx-text/docs/superpowers/specs/2026-11-01-design-text-layer.md` (1..352)
**Inputs read in full:** the persona, the zoom-out standard, the target, and these reports in `/Users/omrikatz/Public/web/aidx-text/egm-review/r2/`: zoom_out_report.md, comprehension_report.md, design_report.md, structural_report.md, style_report.md.
**Code checked:** under `packages/extensions/design/src`: `server/matchers/tile.ts`, `tool/steps/diff.ts`, `tool/steps/target.ts`, `server/unmatched.ts`, `shared/types.ts`, `shared/tolerances.ts`, `client/components.ts`. Also the parked branch's `/Users/omrikatz/Public/web/aidx-659/packages/extensions/design/src/server/deltas/colors.ts` and `server/raster.ts`.

## Verdict

The architecture is right: mask only the text both sides agree on, and fall back to today's pixels everywhere else. The three Blockers the reports raise all come from one cause. Agreement is decided per component, using strings only. Fixing that cause and moving the mask out of the matcher makes the design **smaller** than the current draft. Most of the Majors either disappear with that fix or should go to Non-Goals with a stated ceiling. Several reviewer recommendations would push the design toward over-engineering, and are rejected below.

## Rulings on (a) to (g)

### (a) Agreement = equal strings AND ink colour within `colorDeltaE`. **Adopt it, add one positional clause, and reuse existing code.**

- Every report is right that CUJ 3 cannot pass under string-only agreement. This is Blocker B1.
- **Reuse:** the parked branch already has `glyphCoreColor({raster, box, glyphs, background, color})`. It computes a ΔE mask, erodes it, and returns `null` when there is no ink (`aidx-659/.../deltas/colors.ts:17-34`). That is exactly the measurement the colour check needs, taken over a group's boxes on each side.
  - It is also the fix for design M7 (blended ink median in Step 1). Step 1 should copy `glyphCoreColor` with `eroded`, called with `glyphs: [box]`, rather than the median of all ink candidates.
  - That gives one function for both uses and no new clustering heuristic. Reject the "top quartile by ΔE" proposal as invented work when tested code already exists.
- **Add one positional clause:** the group's live box union and target box union agree edge for edge within an OCR bound. That needs one new named constant (e.g. `textOffsetPx: 8`, the spike's max box error). `geometryPx` (2) is tighter than the OCR error, so it cannot be reused.
  - This closes design M5 (moved text masked up to half a box) in the same predicate.
  - Without it, line 55's Non-Goal claim ("inside OCR box error") is false.
- **Reject** design B1's extra "trimmed box size within OCR error" clause as a separate test. The edge bound above covers gross size changes.
  - Weight, italic, decoration and letter-spacing changes that keep string, colour and edges within 8px become a **named blind spot** in Non-Goals.
  - Detecting them needs a style or ink-density comparator, and that belongs to the Figma follow-up.
- **State the split explicitly:** a group that fails only on colour or position is unmasked and emits **no** `text` delta. The existing `foreground` and geometry kinds report it. A `text` delta requires the strings to differ. Without this rule, the new clauses would produce `text` deltas with equal strings.
- Failing in the safe direction is acceptable here. If cross-renderer ink differs by more than ΔE 3, the group disagrees and the noise stays, which is today's behaviour. No regression.

### (b) Connected components vs cutting target runs at live boundaries. **Use connected components, computed page-wide.**

- **Cutting is not viable.** `per-box` OCR returns no per-character positions. Cutting a target run at a live boundary would need proportional string splitting by pixel width, which is fragile, untested and needs a new heuristic.
- **Connected components** (union-find over "live box overlaps target box by more than half the smaller box") is about 20 lines. It fixes three things together:
  - B2: inline markup like `<p>Total <strong>$20</strong> due</p>`.
  - Comprehension 6: one OCR run spanning `Export Share`.
  - B3 / S2: one-sided text. A component with runs on only one side is not a decision, so it produces no mask and no text delta. Also skip grouping entirely when the target has no runs.
- **Join rule:** both sides use the same reading-order sort (by each item's first box), compared with **all whitespace removed** after case folding.
  - Whitespace removal is the same cost as collapsing whitespace, and it closes design N3 (OCR adds or drops spaces).
  - It is also required once strings are concatenated across nodes ("Total " + "$20" + " due").
- **Attribution of a disagreeing group:** the owner of the group's first live item in reading order. For inline markup, that is the outer element. One rule, no ancestor walk.
- Delete Step 4's translation clause and `groupText`'s `pairs` input. They are circular and dead (zoom-out 2, design M1, S4, comprehension 2).

### (c) One page-level mask vs per-component descendant lists. **Page-level, and one rung lazier than the reports propose: apply it to the raster, not inside the matcher.**

- A page-level mask fixes design M4 (a neighbour's or parent's text inside `tileMargin`) and removes the ancestry rule.
- **Simplest form:** in `diff.ts`, before `design.matcher.match`, copy the target's pixels into a copy of the live raster over every agreeing group's boxes (both sides, grown by halo plus `blurRadius`). Pass `{...live, raster: masked}` to the matcher.
  - Masked pixels are then identical, so the comparator counts them as equal, and the denominator is untouched.
- This removes from the plan:
  - The `ignore` parameter on `tileMismatch`.
  - The `groups` input to `Matcher.match` (no interface change).
  - Copying `boxMask` and `shareInside` (items 1 and 22).
  - `tile.ts` is left untouched.
- Keep the **original** live raster for `sideFrom` (diff.ts:189), `unmatchedRegions` (diff.ts:228) and `writeRun`.
- **Side effect:** the page-level mismatch and the diff image become masked too. Delete Step 7's "stay raw" sentence rather than plumbing two rasters. A diff image without rasterizer noise is the better display.
- If the author still wants the mask inside the matcher, `zeroed` in `server/unmatched.ts:16-27` is the existing fill loop. Generalise its hard-coded `tileMargin` into a parameter instead of copying `boxMask`.

### (d) OCR runs as `TargetNode` kind `'text'` children vs a parallel `TargetModel.text`. **Use children of `root`.**

- `TargetNode` already has `kind: 'text'`, `text`, `box`, `confidence` and `children`, and `TargetNodeSchema` persists them.
- Nothing on the server reads `root.children` except `enrich` (target.ts:15-24). Appending the runs after `enrich` (target.ts:40) keeps the colour enricher off them.
- Old targets already load with `children: []`. That removes:
  - Items 12 and 13 (the `ModelSchema` default).
  - The `TargetModel.text` type.
  - The CUJ 5 special case.
- It is also where the Figma follow-up will put real text nodes, so the follow-up gets one text source instead of two to merge.
- **Ceiling:** none needed today, because no consumer treats `root.children` as layout.

### (e) Reusing `LiveComponent.text` + `Box[]` vs `TextRun[]`. **Neither as written. Use one item per text node: `{text, boxes}`.**

- Zoom-out 3's `Box[]` plus `component.text` works only under per-component grouping. Under (b), groups cross component boundaries.
  - `p.text` is "Total due" (own nodes joined in `components.ts:92`), with `$20` cut out of the middle, so concatenating component strings gives the wrong order.
  - The live side needs strings tied to boxes. That rules out Box[] plus component.text.
- The draft's per-line `TextRun` with the offset walk ("walk offsets until the rect changes") is the over-built answer. A text node's string is its `textContent`, already read. Its boxes are `Range.selectNodeContents(node).getClientRects()`, one call, clipped, rounded and grown by the halo.
  - So `glyphs: {text: string; boxes: Box[]}[]` per component, one per text node, with no substring split.
  - A wrapped node simply joins the connected component of every OCR line it touches.
- **Collection scope:** walk the component's subtree and stop at descendant components, rather than `ownTextNodes`' direct children only. `collectUnder` already recurses through non-component elements the same way. This closes design N5 and comprehension 7 (library `<span>` text with no runs).
- `LiveComponent.text` stays as it is. `deltas.ts:50` uses it.

### (f) Disagreeing-group gate (design M2) and text delta on gated pairs before the filter (design M3)

- **M3: adopt.** It costs nothing, because it is a change of placement.
  - Compute the `text` delta inside the `deltas` expression at `diff.ts:191-196`, for every pair at or above the gate, before the filter at line 211.
  - This is simpler than the draft's "append before provenance", and it keeps a container that paints changed text and has reported children.
  - It also resolves S3 and the circular "reported" definition.
- **M2: defer to Non-Goals with a stated ceiling.** A disagreeing group that stays below `tileGate`, or sits under a parent the matcher does not descend into, is **already missed today** by pixels. So this is not a regression, only an overpromise in Goal 2.
  - Forcing a gate or re-attaching to the deepest reported ancestor couples text into the matcher's descent logic.
  - **Ceiling to state:** "A `text` delta appears only on a pair the matcher reaches at or above `tileGate`. A text change under about 0.5% of its component's tile, or under a parent whose geometry or background already differs, is reported through that parent's pixels, not as text." Reword Goal 2 to match.
- **M1 (list or row shifts give N wrong text deltas): defer with a ceiling.**
  - A cheap guard was checked: emit `text` only when `sameGeometry(liveBox, targetBox)`. **Reject it.** An auto-width button whose label changes from `Export` to `Download` changes width, so the guard would suppress exactly CUJ 2's finding.
  - **Ceiling:** "Text is grouped in the live frame. A vertical shift of more than half a line produces `text` deltas on the shifted rows alongside the geometry findings."

### (g) Band slicing, concurrency serialization, 2x handling

- **Band slicing: move to Non-Goals.** It is unmeasured new logic (slice, merge, dedupe) with no CUJ or test.
  - It fails safe: unrecalled text stays in pixels, which is today's behaviour.
  - **Ceiling:** "Recall on targets taller than about 2000px is not measured; missed text keeps today's pixel noise." Drop it from item 18 and from Risks.
- **Concurrency: keep, as one line.** A promise chain in the reader (`queue = queue.then(() => recognize(...))`) is cheaper than proving the wasm session is re-entrant. Delete the false "store's write queue" claim (design M6, comprehension 4, zoom-out 8).
- **2x exports: Non-Goal.** The adapter already scales to the route width with nearest-neighbour (`adapters/image.ts`).
  - **Ceiling:** "OCR recall on downscaled 2x exports is not measured; misses fall back to pixels." The real-export verification uses a 1x export.
  - Reword Goal 5 to "the adapter's existing scaling applies; no OCR-specific resampling".
- **PNG size limit:** delete the false claim. The missing limit predates this design and is out of scope here.
- **`ocr-failed`:** keep it as a log. The fallback is today's behaviour. Fix line 192 to say so (consistent with item 19).

## Smallest set of changes that closes the Blockers

1. **Agreement predicate (Step 4.3):** equal strings (case-folded, all whitespace removed) AND `glyphCoreColor` on both sides within `colorDeltaE` AND box-union edges within `textOffsetPx`.
   - A `text` delta only when the strings differ.
   - This closes B1 (all reports) and M5.
2. **Grouping (Step 4.1-4.2):** page-wide connected components over live text-node boxes and target run boxes. A component with runs on one side only is not a group, and grouping is skipped when the target has no runs. No translation.
   - This closes B2, B3, S2, comprehension 6 and M1's circularity.
3. **Live text (Step 2, items 7, 8, 10):** `glyphs: {text, boxes}[]`, one per text node in the component's subtree up to child components, with boxes from `getClientRects`. No offset walk, no `TextRun` on the live side.
4. **Masking (Step 5, items 1, 22, 23):** in `diff.ts`, copy target pixels into a copy of the live raster over agreeing boxes, then call the matcher unchanged. Delete `boxMask`, `shareInside`, the `ignore` parameter, `Matcher.match`'s `groups`, and Step 7's "raw" sentence.
   - This closes M4.
5. **Text delta placement (Step 6, item 30):** computed with the delta kinds for gated pairs, before the filter, attributed to the owner of the group's first live item.
   - This closes M3 and S3.
6. **Step 1 (items 1-4):** use `glyphCoreColor` + `eroded` from the parked branch.
   - Drop item 4: `colorAgrees` reads only `.background` (tile.ts:67-69).
   - Map `null` to `undefined` in `enrichers/color.ts`.
   - This closes M7, N1 and N2.
7. **Target storage (items 12, 13):** OCR runs become `kind: 'text'` children of `root`, appended after `enrich`.

Net effect: the design gains one constant (`textOffsetPx`). It loses `TargetModel.text`, the `ModelSchema` change, the matcher interface change, `boxMask`, `shareInside`, the translation, the offset walk and band slicing.

## Majors to defer to Non-Goals, with ceilings

- **M2 (text change below gate or under a non-descended parent):** the text delta exists only on gated pairs. Same miss as today.
- **M1 (row shifts):** grouping is in the live frame, so shifts over half a line yield text deltas on shifted rows.
- **Weight, italic, decoration, letter-spacing changes with equal string, colour and edges within `textOffsetPx`:** masked. Blind spot until Figma node targets.
- **Band slicing / tall targets:** recall above about 2000px is unmeasured, and misses keep today's noise.
- **2x exports:** OCR recall after the adapter's nearest-neighbour downscale is unmeasured.
- **Reading-order join ceiling:** text nodes and runs are ordered by their first box, so unusual inline wrapping may misorder a group into a false disagreement. That leaves pixels plus a `text` delta showing both strings.

## Reviewer recommendations rejected as over-engineering

- Design B1's separate box-size clause. The edge bound covers gross size changes, and the rest is a blind spot.
- Design M7's new "top quartile" clustering. `glyphCoreColor` already exists.
- Design M1's second regrouping pass after matching.
- Design M2's forced gate or ancestor re-attachment.
- Design M6 / zoom-out 8's pixel-count cap. It is a pre-existing gap and out of scope.
- Cutting target runs at live boundaries.

## Not architectural, but required before approval

- Commit the spike document first (S8, comprehension 8, style M12). Every number in Step 3 and Alternative D depends on it.
- Update the constants inventory at line 57 (S5, style M1).
- Give the Alternative B fallback a numeric trigger (style M8).

## Summary

The draft's three Blockers come from per-component, string-only agreement. Page-wide connected components with a strings + `glyphCoreColor` + 8px-edge predicate fix them, and the design shrinks as a result.
Masking should copy target pixels into the live raster before an unchanged matcher. OCR runs should be `kind: 'text'` children of `root`. Live text should be `{text, boxes}` per text node.
Defer gate dilution (M2), row shifts (M1), band slicing, 2x exports and weight/italic changes to Non-Goals with the stated ceilings. Keep the M3 placement fix and the one-line concurrency queue.
