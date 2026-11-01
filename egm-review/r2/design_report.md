# Design Critic, round 2: 2026-11-01-design-text-layer.md, lines 1..219

Target: `/Users/omrikatz/Public/web/aidx-text/docs/superpowers/specs/2026-11-01-design-text-layer.md`
Standard: feature-spec-standard.md. Problem, Goals, Non-Goals, Architecture, Alternatives, Risks and NFRs are all present, so the section requirements are met. The findings below are about the design itself.
Code checked: `src/server/matchers/tile.ts`, `src/tool/steps/diff.ts`, `src/server/raster.ts`, `src/server/deltas.ts`, `src/server/deltas/colors.ts`, `src/server/enrichers/color.ts`, `src/shared/above.ts`, `src/shared/tolerances.ts`, `src/server/store.ts`, `src/server/adapters/image.ts`, `src/tool/steps/target.ts`, `src/client/components.ts`, `packages/it/test/design.it.test.ts`, the fixture `Toolbar.tsx`/`styles.css`, and the parked branch's `TEXT_NOISE`. All file paths are under `packages/extensions/design/src` unless they start with `packages/`.

## Status of the round-1 fixes

- **A1 (mask only agreeing text): broken.** "Agree" means equal strings. That masks every glyph-level style change (B1). The grouping is also many-to-one (B2), and one-sided runs still produce deltas (B3).
- **A2 (foreground fix): partly done.** The direction is right and it does not need the text layer. It dropped the erosion / two-cluster step, so the median still includes anti-aliased blends (M7). Its list of callers is wrong (N1, N2).
- **A3 (no `ownMismatch`): holds.** Ignored pixels are a union mask counted as equal over the full tile area, so nothing is counted twice. `tileGate` keeps its meaning.
- **Risks section and terms section:** added. Two of the Risks claims are false against the code (M6, N4).

## Blockers

### B1. String equality masks recolored, re-weighted and resized labels. CUJ 3 fails and the reason for rejecting Alternative A applies to this design.

Lines 16, 46, 76-78, 121, 127-129, 157.

- Step 4 item 3 says a group agrees when the case-folded strings are equal.
- Step 5 counts agreeing boxes as equal pixels for the component and every ancestor.
- **CUJ 3 failure:**
  - The live label `Export` in `#ffd166` groups with the target `Export` and agrees, so its line box plus 2px is masked.
  - The button tile is then only `#426bf2` on both sides, so mismatch is about 0, below `tileGate`.
  - `tile.ts:108-115` does not descend and `diff.ts:185` does not report it, so no `foreground` delta.
  - The header's ignore list contains the same boxes, so the header is below the gate too.
- Commit 1's `text-recolor` test (plan item 5) passes, then commit 4 breaks it. That fails the "all tests pass after every commit" gate.
- The same thing happens to `font-weight` (bold vs regular in a fixed-width button), small `font-size` changes, `text-decoration`, italics and `letter-spacing`. These changes are visible only in text pixels today and are caught; under this design they disappear.
- Line 157 rejects Alternative A because "a recolored label ... produced nothing". This design produces nothing for the same input.
- **Recommendation:** agreement must also check ink. For example: equal strings AND Step 1's ink color on both sides within `colorDeltaE` AND the target run's trimmed box size within OCR error of the live ink box. Otherwise the group disagrees and keeps its pixels. CUJ 3 then holds without a new mechanism, because Step 1's estimator already exists.

### B2. Grouping is many-to-one, so text split across inline markup never agrees and gets false `text` deltas.

Lines 100, 119-123.

- Live runs belong to the component that owns the text node.
- OCR returns one run per visual line, regardless of DOM boundaries.
- Step 4 item 1 attaches a target run to every component whose glyph box it overlaps by more than half of the smaller box. The live glyph box is nearly always the smaller one, so a long OCR run attaches to every component on that line.
- **Scenario:** `<p>Total <strong>$20</strong> due</p>`, where both elements carry `data-conciv-source`.
  - `p` group: live `total due` against target `total $20 due`. Disagrees.
  - `strong` group: `$20` against `total $20 due`. Disagrees.
  - Nothing on the line is masked, so cross-renderer noise stays. Goal 1 fails for any paragraph containing a link, bold span or inline badge.
  - When the pair is reported, the agent is told to change `total due` to `total $20 due`. That is a wrong instruction to edit correct text.
- The fixture's buttons are separate runs, so CUJ 1 and CUJ 2 do not exercise this.
- **Recommendation:** group by connected components of the overlap graph between live and target runs, across component boundaries. Decide agreement per connected group, then hand each live run's share back to its owning component. Alternatively, cut target runs at live run boundaries before comparing.

### B3. A component with live glyphs and no target runs has a "disagreeing" group. Old targets and icon fonts then get `text` deltas, which contradicts CUJ 5 and Non-Goals.

Lines 54, 86-90, 119, 123, 129, 133.

- Step 4 creates a group for every live component that has glyphs (line 123: only "a component with no glyphs has no group").
- Line 129 says a one-sided run "is not in any group". Line 123 contradicts this for runs that exist only on the live side.
- **Scenario 1, old target (`text: []`):**
  - Every component with text gets a group with target `''` that disagrees.
  - Every reported pair gets `{kind: 'text', live: 'Export', target: ''}`.
  - In `diff.ts:211` a container that was dropped before is now kept, because it has deltas.
  - It counts as above tolerance through `above.ts:5`. CUJ 5's "results are those of the current release" is false.
- **Scenario 2, icon-font ligature:** `<span class="material-symbols">search</span>`. OCR reads nothing, so the icon gets `live: search, target: ''`. Line 54 promises these "are compared by pixels as today".
- The same happens after an `ocr-failed` registration (line 192) and after an OCR miss.
- **Recommendation:** a group exists only when both sides have at least one run. Skip grouping entirely when `target.text` is empty. State in Step 6 that a one-sided group never produces a `text` delta.

## Major

### M1. The translation in Step 4 item 1 can never run, so grouping is always in the live frame. List or row shifts produce many wrong `text` deltas.

Lines 117-119, 141-147.

- Step 4 runs "once per diff, before the tile pass" (line 117), and the data flow at line 144 runs it before `matcher.tile`.
- Target boxes exist only after the tile pass (`tile.ts:95`). The mismatch that decides whether `estimateTarget` runs at all already depends on the masking computed from the groups. That is circular.
- So "when the matcher has a target box" is always false, and plan item 21's `pairs` input does not exist yet.
- **Scenario:** the design has an extra row at the top of a list with 36px rows.
  - Each live row's glyphs overlap the target run one row up.
  - Every row disagrees, and every reported row says `live: Invoice 2, target: Invoice 1`.
  - The real finding is one missing row; the report shows N text edits.
- **Recommendation:** keep the live-frame grouping only for masking. Leaving a group unmasked just means today's behavior. For the `text` delta, regroup each reported pair after matching using its final `targetBox`. Delete the translation clause from Step 4.

### M2. A disagreeing group can stay below `tileGate`, or sit under a parent the matcher never descends into, and its `text` delta is lost. Goal 2 is not guaranteed.

Lines 24-25, 44, 129, 133.

- Line 129 says a disagreeing group "trips the existing gate". That is asserted, not shown.
- **Scenario 1, small text in a large component:** a 300x200 card paints its own price, `$20` changed to `$28`.
  - About 100-150 differing pixels after blur, over a (300+16)x(200+16) = 68,256 px tile, is about 0.002 < 0.005.
  - The card is never reported and no `text` delta appears.
- **Scenario 2, descent blocked:** descent also needs `sameGeometry` and `colorAgrees` on the parent (`tile.ts:109-114`) and depth below `TOLERANCES.depth` (3).
  - If the header's height differs from the design, the button with `Download`/`Export` is never paired.
  - The header is reported, but it has no group of its own, so the text change is reported nowhere.
- CUJ 2 does not catch either case: its button fills about 1% of its tile and its parent's geometry matches.
- **Recommendation:** a disagreeing group makes its component (and its ancestors, for descent) count as at or above the gate. Alternatively, attach each disagreeing group's `text` delta to its deepest reported ancestor.

### M3. Defining the `text` delta on "reported" pairs drops containers that paint their own changed text and also have reported children.

Lines 25, 133. Plan item 30 confirms it.

- "Reported" (line 25) is the set after the filter at `diff.ts:211`, which drops a pair with no deltas and with reported children.
- Step 6 adds the `text` delta to reported pairs, and item 30 appends it "before provenance", which is after the filter.
- **Scenario:** `<button>Download <Badge/></button>` against a target `Export` with a badge.
  - The button reaches the gate and the badge child is reported for its own reason.
  - The button has no style delta, so it is filtered out before its `text` delta is added. The text change disappears.
- **Recommendation:** compute the `text` delta together with the delta kinds at `diff.ts:191-196`, for every pair at or above the gate, before the filter.

### M4. The ignore list covers only the component's own and its descendants' boxes, but tiles are grown by `tileMargin` (8px). Neighbor and parent text noise keeps the component above the gate and status never reaches `done`.

Lines 23, 127.

- **Scenario:** `<a><Icon/> Settings</a>`, where the anchor paints `Settings` itself.
  - The icon's tile is 16+16 = 32px square and includes the `S` a few pixels away.
  - That text belongs to the parent, not to the icon's subtree, so it is not ignored.
  - Rasterizer noise on the `S` (30-60 px out of 1,024) is 3-6%, far above 0.5%.
  - The icon is reported with `deltas: []` and no children, so it is above tolerance (`above.ts:5`). Goal 4 and CUJ 1 fail on any page with icon+label rows, chips, or tight flex rows.
  - The fixture escapes this only because its labels sit 16px inside the buttons and the buttons are 8px apart.
- **Recommendation:** build one page-level ignore mask from all agreeing groups and apply it to every tile. This is simpler and has no ancestry rule.

### M5. Text that has moved is masked as long as the half-overlap holds, not just within "OCR box error". New false negatives for text-only components.

Lines 55, 119, 127.

- Line 55 says only shifts within OCR error (3px median, 8px max) go undetected. The real limit is the overlap rule: up to half the run's width horizontally, and half its height vertically.
- **Scenario:** `<h1>Quarterly revenue report</h1>`, about 200px wide, with a wrong `margin-left: 24px`.
  - The overlap is 176/200, so the group agrees and both glyph areas are masked.
  - The h1 tile mismatch is about 0, so no inset delta. Today this case is caught.
- **Recommendation:** an agreeing group masks only when the offset between the target run and the live run is within the OCR error bound (8px, or a named tolerance). Past that, treat it as disagreeing so the pixels stay. Correct line 55.

### M6. False mitigation claims in Risks.

Lines 194, 196.

- **Line 196, concurrency:** "concurrent `design_target` calls share it through the store's existing write queue, which already serializes registrations."
  - The queue in `store.ts:98-155` wraps only `put`.
  - OCR runs before `put` (`target.ts:40-41`, plan item 19), so concurrent registrations call `recognize` on the shared singleton session at the same time.
  - **Scenario:** an agent registers 375/768/1280 with `Promise.all`. Whether the wasm session tolerates concurrent runs is unverified. If it throws, the result is `ocr-failed`, then `text: []`, then a target that silently never masks.
  - Fix: serialize with a promise chain inside the reader.
- **Line 194, PNG size limits:** "the existing adapter's size limits apply". `adapters/image.ts` has no size limit. `decodePng` plus `scaleToWidth` accept any dimensions, so a tall export decodes fully into memory and is then sliced by the reader. Either add a limit or remove the claim.

### M7. Step 1's ink median still includes anti-aliased blends. The CUJ 3 tolerance and cross-renderer equality are not shown.

Lines 46, 78, 96.

- Candidates are all pixels more than ΔE 3 from the background, which includes almost every partially covered edge pixel.
- On 11-16px text, partial pixels are usually as many as or more than full-coverage pixels, so the per-channel median lands on a blend.
- `sampledFills` crops the exact box (`colors.ts:12`), so the rounded-corner pixels of a 6px-radius button (parent color) are also counted as ink.
- **Scenarios:**
  - CUJ 3 asserts target "within `colorDeltaE` of `#ffffff`". With a blend median this likely fails.
  - Grayscale vs LCD anti-aliasing changes the share of partial pixels, so live and target medians differ by more than ΔE 3. Any pair reported for another reason gets a false `foreground` delta, which is the original consequence 1.
- Round 1 recommended the parked branch's `glyphCoreColor` (ΔE mask, erode, `null`); the erosion was dropped.
- **Recommendation:** take the high-contrast cluster, for example pixels in the top quartile by ΔE from the background, or erode the ΔE mask by 1px. Exclude pixels outside the border radius. State the measured result on `text-recolor` and `u1-1280-grayaa` in the spec.

## Nits

- **N1 (line 96):** `colorAgrees` reads only `.background` (`tile.ts:69`), so "treats `null` as agreeing" and plan item 4 change nothing. Remove both.
- **N2 (line 96):** the list of callers is incomplete. `enrichers/color.ts:13` also calls `foregroundColor`. The stored `fills.foreground` is `z.string().optional()` (`store.ts:34`), so a stored `null` would fail the model parse. Map `null` to `undefined` there.
- **N3 (line 120):** collapsing whitespace is not enough. OCR often drops or adds inter-word spaces (`Sign in` read as `Signin`), which gives a disagreeing group and a delta telling the agent to delete a space. Compare with all whitespace removed and keep the raw strings for display. Hyphenation (`hyphens: auto`) and soft hyphens have the same problem and belong in Non-Goals.
- **N4 (line 192 vs plan item 19):** Risks says `ocr-failed` is "reported by the tool"; item 19 says it is logged, not thrown. If it is only logged, the user never learns that the target has no runs. Return it as a warning in `TargetResult`.
- **N5 (lines 21, 100, `components.ts:59-63`):** "direct text-node children, not descendants that are components" is ambiguous. The existing `ownTextNodes` is direct children only, so text inside non-component descendants (library DOM such as `<span class="label">` with no `data-conciv-source`) has no live runs. Its target runs are then one-sided, never masked, and keep their noise. Specify that collection walks the subtree and stops at component boundaries. This is borderline Major on library-heavy pages.
- **N6 (line 48):** "consumed as exported, at 1x" does not say what happens to a 2x export. `scaleToWidth` uses nearest-neighbor downscaling, which damages glyphs before OCR. Either reject 2x exports or state the expected recall.

## Answers to the caller's questions

1. **Grouping when the matcher has not paired the component (Step 4 item 1):** it never has; grouping always runs before pairing. See M1.
2. **Double counting from ignoring boxes on both sides:** no. The ignore mask is a union and the denominator is the tile area, so A3 is sound. The real problems with the ignore list are its scope (M4) and what it hides (B1, M5).
3. **Can a disagreeing group fall below `tileGate` and vanish:** yes, both by tile-area dilution and by blocked descent or depth. See M2.
4. **Does the text delta reach a component that is not reported:** no. It is also lost for a container that is filtered out after the gate. See M2 and M3.
5. **Badge header (CUJ 4) under the new filter:** holds in the fixture.
   - The badge is a `backgroundImage` at x=48..144, and the buttons sit at the right (`justify-content: flex-end`). The button tiles never reach the badge.
   - The header's declared `backgroundColor` stays `#ffffff`, so `colorAgrees` passes and the matcher descends.
   - The 0.5px `TEXT_NOISE` shadows stay inside the 1px halo plus the 1px blur growth. The buttons drop below the gate, and `diff.ts:211` keeps the header with `deltas: []`.
   - It breaks if a neighbor's text sits inside a child's tile margin (M4), or if OCR merges `Export Create` into one run (B2).
