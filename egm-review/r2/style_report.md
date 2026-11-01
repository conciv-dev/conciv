# Style review r2: 2026-11-01-design-text-layer.md

Files read in full: style.md (persona), the target (lines 1..352), and consolidated_review_report.md. The other r1 reports were searched for the wording items. No style standard was supplied, so the review uses the persona's audit vectors plus the caller's checks (contradictions, undefined terms, numbers, sentences likely to be misread, promotional wording).

## Prior-round items: confirmed resolved

- The "never reads the labels" vs 86.7% conflict is gone. Line 174 now reads "91 of 105 runs overall and 0 of the white-on-blue button labels".
- "No numeric threshold" is gone. Step 4 states its half-overlap rules openly (lines 119-120).
- "visibly different hue" is replaced by a value tied to `colorDeltaE` (line 76).
- "Figma, Sketch or another OS" is reworded (line 32).
- Term drift is mostly fixed. Live = `glyphs`, target = `text`, both of type `TextRun` (lines 100-101).
- Defined: Component, Pair, Tile, Reported, Above tolerance, the three tools, and the spike (lines 21-28).
- Case folding and truncation are listed in Non-Goals (line 56). The `unmatched` clause is in the status rule (line 26). The page-level mismatch stays raw (line 137).
- Partly regressed: the postinstall wording. See M5.

## FeatureRange 1..219

**B1. Blocker. Lines 46, 74-78, 121, 127-129, 161 vs Step 5.** A recolored label has the same text on both sides, so its group agrees (line 121: agrees when the strings are equal). Step 5 then ignores its boxes, grown by `blurRadius`. The tile falls below `tileGate`, no pair is reported, and no `foreground` delta runs. This contradicts Goal 46 and CUJ 3. It is also the exact loss line 40 and Alternative A (line 156) give as the reason for rejection, and line 161 counts "a recolored glyph still shows" as an advantage of B over this design. The document must say how a recolor survives masking, or drop Goal 46 and CUJ 3. The commit 1 `text-recolor` test (line 243) would start failing at commit 4.

**B2. Blocker. Lines 90, 123, 129, 133 vs CUJ 5.** Line 123 says only a component with no glyphs has no group. So a live component with text but no matching target run still has a group: its target side is empty, its target string is `''`, and the group disagrees. Step 6 (line 133) emits a `text` delta for every reported pair whose group disagrees. Consequences:

- Line 129 says a one-sided run (OCR miss, old target) "is not in any group". That is false for live-side runs.
- CUJ 5 (line 90, "results are those of the current release") is false. Every reported pair with text on an old target gets `{live: 'Export', target: ''}`.
- These are the `target: ''` deltas the r1 action item A1 removed.

State that a group needs runs on both sides.

**M1. Major. Line 57 vs line 257.** "One new constant is added, the ink trim threshold." Item 9 adds two: `glyphHalo: 1` and `inkTrimThreshold: 40`. Line 100 also hardcodes "grown by one pixel" where the plan uses `glyphHalo`.

**M2. Major. Lines 25-26.** "Reported" requires mismatch at or above `tileGate`. "Above tolerance" is then "a reported component with deltas **or** with mismatch at or above `tileGate`". Under line 25 every reported component already meets the second condition, so the "with deltas or" branch either never applies or the two definitions disagree. Line 25 also has a scope problem: in "a pair at or above `tileGate` that has deltas, or has no reported children", it is unclear whether the gate applies to both alternatives.

**M3. Major. Line 117 and line 119 vs items 21 and 23 (lines 297, 303).** Grouping runs "once per diff, before the tile pass", yet it translates by the matcher's `targetBox - liveBox`, which exists only after matching. `groupText` takes `pairs` (line 297), but item 23 computes groups "after the capture" and passes them to the matcher. The order is contradictory. Also, "for a component not yet paired, the live box is used" does not say what it is used for (presumably: no translation).

**M4. Major. Line 192 vs line 289.** Risks says the failure "is reported by the tool as an `ocr-failed` error". Item 19 says the `toolError` "is logged, not thrown". A reader cannot tell whether the caller of `design_target` sees the error.

**M5. Major. Line 109 vs line 202.** Line 109 says `@napi-rs/canvas` comes "with no install script". Line 202 says "No install scripts beyond `@napi-rs/canvas`'s prebuilt selection", which implies one exists. This is the r1 postinstall wording item, restated.

**M6. Major. Line 107 vs line 202.** "Wasm ships one 15MB runtime file" reads as a 15MB install. Line 202 gives about 145MB in `node_modules`. Say "loads one 15MB file".

**M7. Major. Line 191.** "so the reader sees the misread for what it is". In this document "reader" is the `TextReader` component (Step 3 heading, line 101, line 105). Here it means a human, which reads as the OCR component recognizing its own misread. Use "the user".

**M8. Major. Lines 163, 191, 350.** The fallback criteria cannot be measured: "if OCR proves unreliable on real exports" and "If misreads prove common". Line 350 defers the decision to "before release" with no threshold. State the number of misreads that triggers Alternative B.

**M9. Major. Line 56.** Truncated text "produces a `text` delta" and is "documented as a blind spot". A false `text` delta is a false positive, not a blind spot. It also undercuts Goal 44 for any clamped label. Name it as a known false positive.

**M10. Major. Line 64 vs line 312 (and line 349).** CUJ 1 says the precondition is "asserted by the test". Item 26 says the test is skipped when the precondition fails. Assert and skip are different outcomes, and a skip means the CUJ is never verified.

**M11. Major. Line 193 vs line 351.** Risks says "the reader's module has one test that constructs the service, so a bump ... fails the build". Verification says the test is an integration test in `packages/it` that registers a target. It fails the test run, not the build. Item 19's catch-and-continue (`text: []`) also means construction failures are swallowed unless that test asserts runs exist.

**M12. Major. Lines 28, 107, 209 vs item 35 (line 343).** The spike document is cited in present tense as the source of every number in Step 3 and Alternative D, but commit 6 is what creates it, from a "session scratchpad". Until then, a reader of the design cannot check 105/105, 112/112, 97/98, 91/105, 0.3s or 60MB.

**M13. Major. Line 107.** "105 of 105 runs recalled and 112 of 112 boxes correct" uses two different counts for the same page without explaining how runs relate to boxes. "Boxes correct" is not defined. "28 renders" is not tied to the 390px fixture or the 98-run page.

**M14. Major. Line 48.** "The target PNG is consumed as exported, at 1x" can be read as "any export is accepted and normalized to 1x" or as "only 1x exports are accepted". Line 100 relies on 1x for coordinates. State what happens to a 2x export.

**N1. Nit. Line 11.** "the component gate" is undefined; the defined term is `tileGate`. "style provenance" is undefined jargon. "every renderer rasterizes glyphs differently" overgeneralizes.

**N2. Nit. Line 38.** "`design_status` never reaches `done` on a page with text" is absolute. It holds only when text tiles exceed `tileGate`.

**N3. Nit. Line 55.** "matched run group" is not a defined term; Step 4 calls it a "group".

**N4. Nit. Lines 84, 312.** "status stays open" / "status open": "open" is still undefined. Only `done` is defined.

**N5. Nit. Line 78.** "`live` near `#ffd166` and `target` near `#ffffff`": "near" cannot be measured. Line 243 uses "within `colorDeltaE`" for the target and states nothing for the live value.

**N6. Nit. Line 133.** "the raw joined strings": joining is itself a normalization step (line 120). Say "before whitespace collapse and case folding".

**N7. Nit. Line 119.** "by more than half the smaller box" does not say whether this means area or each axis.

**N8. Nit. Line 111.** In "from 6px to 3px (8px max)", it is unclear whether 8px is the maximum before or after trimming. `sharp.trim` and "ppu" (line 109) are used without introduction.

**N9. Nit. Line 195 vs line 286.** The risk threshold is "taller than about 2000px", but slicing triggers at 1280px. Explain the gap. "deduplicating by overlap" is unspecified.

**N10. Nit. Line 204.** "verified with an empty `HOME`" is in past tense, but the Verification Plan has no such check. State whether this was done in the spike or will be done.

**N11. Nit. Line 210.** It says `glyphCoreColor` and `eroded` are "reused as noted in the plan", but the plan never mentions them. Step 1 uses a different method.

**N12. Nit. Line 96.** "with no text information at all": cut "at all". Line 174: "clear digits" is subjective.

**N13. Nit. Line 16.** "Masks, out of the pixel comparison, the text that..." splits the verb from its object. Rephrase as "Removes from the pixel comparison the text that...".

## DetailedRange 220..352

**M15. Major. Line 306 vs CUJ 4 (line 82) and CUJ 1.** The `textnoise` and `badge-textnoise` variants add a `TEXT_NOISE` text shadow. A shadow is not a rasterization difference, and shadow pixels outside the grown glyph boxes stay in the diff. CUJ 4's "differ only by rasterization" is therefore not what the test exercises. "text noise" is undefined.

**M16. Major. Line 350.** The test "asserting no `text` delta" is also said to "record the misread strings" if the text "does not group". An asserting test fails; it does not record. "does not group" is not a Step 4 outcome (groups agree or disagree). No numbered item adds `packages/it/test/fixtures/design/exports/` or this test. Line 191 says the export is added to "the measured set", which is a different artifact from a committed test.

**M17. Major. Line 105 vs line 251.** Line 105 says the `TextReader` slot in `Comparators` "exists and is `null`". Item 7 adds `Comparators.text: TextReader` (non-null) as if new. State the current type and the change.

**N14. Nit. Line 228 vs line 15.** Line 15 says Step 1 "ships first"; line 228 says it ships alone "if the rest is delayed". Line 231 also adds `boxMask` "for commit 4" to the standalone fix commit. It is unused in commit 1, conflicts with the commit title, and may trip `fallow audit`.

**N15. Nit. Line 234 vs line 237.** The `null` guard in the `foreground` kind is unreachable once `sideStyles` sets `color` only for strings. Say whether it is defensive.

**N16. Nit. Line 263.** "(parked branch line 15)" does not name the file. Line 280: "`onnxruntime-node: false`" does not say which key it belongs to, and "Dependencies on all three" does not say whose.

**N17. Nit. Line 292.** "the test at line 266" points to a line number that will drift as commits add tests. Name the test instead.

Promotional wording: none of substance. "stronger agreement test" (line 163) is backed by the `Export`/`Expert` example.
