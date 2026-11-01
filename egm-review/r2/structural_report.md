# Structural Review, round 2: 2026-11-01-design-text-layer.md (lines 1–219)

Scope: the design half only. Checked against feature-spec-standard.md and the round 1 reports, which are not repeated.

## Structure map

H1 → Overview, The Problem, Goals, Non-Goals, CUJs (H3 ×5), Technical Plan (H3 Steps 1–7 and Data flow), Alternatives (H3 A–F), Risks & Mitigations, NFRs, Additional Resources, Future Improvements. The headings don't skip levels, and every section the standard requires is present in a sensible order. Each Alternative has the same Pros / Cons / Reason layout. The code block is closed.

## Blockers

**S1. Goal 3 and CUJ 3 can't pass under Steps 4–5 (lines 46, 74–78 vs 115–129, 161–163).**

- Step 4 decides agreement by comparing case-folded strings only. A recolored label with the same text therefore agrees.
- Step 5 then counts its pixels as equal. The button's mismatch falls below `tileGate`, so the pair is not reported.
- With no reported pair, no `foreground` delta is produced.
- Alternative B's Pros (161) say B catches this case ("a recolored glyph still shows"), so the rejection at 163 ("OCR string equality is a stronger agreement test") contradicts the design's own Goal.

Fix: either make agreement also require ink color agreement (Step 1's ink median within `colorDeltaE`), or run the `foreground` delta kind on pairs below the gate. Then update the B rejection.

**S2. Text that only one side has is defined three incompatible ways (lines 54, 88–90, 119–123, 129, 192).**

- Step 4 (119, 123) gives a group to every live component with glyphs. When no target run overlaps, the target string is "", so the group disagrees.
- Step 6 (133) then emits a `text` delta with `target: ''` on every reported pair that has text.
- Line 129 says an OCR miss or old target "is not in any group".
- CUJ 5 (90) and Risk 192 say an old target, or a target stored with `text: []`, gives "results … of the current release" and "diffs work as today". That is false whenever a pair with text is reported.

Fix: add a rule to Step 4 that a group with zero runs on either side is one-sided and makes no group. This also restores the deletion of the `target: ''` branch that round 1 asked for (A1).

## Major

**S3. Step 6 and the Data flow disagree on when the `text` delta is computed (lines 25, 133, 147–148).**

- Step 6 computes it for "each reported pair".
- "Reported" (25) depends on the pair having deltas, which makes the definition circular.
- The Data flow computes the text delta before the "existing report filter".

Consequence: a container whose own text disagrees but which has reported children is either dropped or kept, depending on which version you read. Fix: say "pairs at or above `tileGate`", to match the data flow.

**S4. Grouping runs "before the tile pass" but uses the matcher's target box (lines 117, 119).**
Pairs are created during the tile pass (line 24), so no component has a target box when grouping runs. The fallback "the live box is used" then applies to every component, and the translation is always zero. Fix: either state the true order (group per pair as the matcher descends) or drop the translation clause.

**S5. "One new constant" is false (line 57 vs 111, 119–120, 100, 195).**

- Inventory: `inkTrimThreshold` (40), the 2px trim floor, the half-box overlap rule, the half-height line rule, the 1px halo, and the 1280px band height.
- Alternative B is rejected partly for needing "two tuning constants" (162), so the count matters to the argument.

Fix: list the constants or reword line 57.

**S6. A risk mitigation adds design that the Technical Plan doesn't have (lines 195–196 vs 103–113, 142–146).**

- Band slicing with run merging and overlap deduplication appears only under Risks. Step 3 and the Data flow show a single read of the whole raster.
- Risk 196 says the store's write queue serializes OCR. The Data flow runs the reader before `store.put`, outside that queue.
- The `ocr-failed` path (192: an error is reported, yet the target is still stored) appears in no Step, CUJ or data flow. It is also unclear whether the tool call succeeds or fails.

Fix: move these into Step 3 and the Data flow.

**S7. Goals 5 and 6 have no CUJ, and the problem's main case has no CUJ (lines 32, 48–49, 64, 191).**

- Every CUJ uses a Chromium-rendered target. Goal 5 ("consumed as exported, at 1x") and the problem statement (Figma or Sketch exports) are never exercised.
- Neither the Goals nor the Non-Goals say what happens with 2x or retina exports.
- Goal 6 (no download, no telemetry) is verified only by an NFR note (204).
- Risk 191 points to "(see Verification)", but no such section exists in the range. The nearest match is "Verification Plan" at line 345, as an H3 under the Implementation Plan.

Fix: add a CUJ with a designer export, state 2x handling, and point to Goals 5 and 6 from the Verification Plan by its exact name.

**S8. The evidence file is still not readable (lines 28, 107, 111, 174, 209).**
`docs/superpowers/specs/2026-11-01-design-text-layer-spike.md` does not exist in the repo. The Implementation Plan (item 35, line 342) creates it. All measured claims (105/105, 97/98, 3px/8px, 0.3s) therefore can't be checked at review time. Fix: commit it before this design is approved.

## Nits

**S9. Terms drift.**

- "matched run group" (55) is a phrase not defined anywhere; Step 4 defines only "group".
- "Reported" is defined for a pair (25), but "above tolerance" is defined for a "reported component" (26).
- If reported implies mismatch at or above `tileGate`, the "with deltas or" clause in 26 is dead and the two terms mean the same thing.
- "open" (84) is still undefined; it was raised in round 1 (A12) and is not resolved.

**S10. Install-script wording conflicts (line 109 vs 202).**
Line 109 says "no install script"; line 202 says "no install scripts beyond `@napi-rs/canvas`'s prebuilt selection". Use one wording (carried over from A12).

**S11. "as noted in the plan" (210) names no section.**
Name "Detailed Implementation Plan" or the commit items that reuse code from the branch.
