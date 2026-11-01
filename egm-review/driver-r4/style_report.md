# egm-style review: `docs/designs/design-driver.md` (revision 4, lines 1–483)

## Verdict

Revise. 0 Blockers, 16 Majors, 24 Nits.

The Terms table (9–33) fixes "residual", "mirror vs rrweb Mirror", "ruling" and "EGM". "round" vs "run" is fixed for the loop meaning. Several renames are incomplete: "engine", "frame", "fill" and "source" still carry two or more meanings; mirror, node and pair are defined narrower than used. Open from r3: unsourced performance numbers, constants with no value, long rule sentences. One numeric claim (316) does not match the document's own table.

## Majors

### Terms

- **M1. "run" still means two things (147, 149, 152, 216, 407).** Body uses bare "run" for OCR lines. Always "text run" or rename to "OCR line".
- **M2. "node" definition contradicts the text-node model (23 vs 216, 212).** A text node is one or more text runs; 231 pairs "a text run" with an svg/img; 232 aligns "paired text runs". Fix the definition; say whether text runs or text nodes take part in pairing.
- **M3. "pair" is node-to-component (25) but also used node-to-node (58, 147, 168, 231, 272).** Use "twin" for every node-to-node link.
- **M4. "mirror" defined as laid out at the design width (20) but used at other widths (22, 104, 152).** Define as laid out at a chosen width, default the design width.
- **M5. "engine" has three meanings** (150 layout engine, 76/324 decision engine, 280/361 "engine HTTP routes"). Write "server process HTTP routes"; keep "engine" for one meaning.
- **M6. "frame" means hidden iframe (294, 397, 403, 442, 447) and captured video image (230, 238, 352, 362).** Prose at 397, 442, 447 should say "hidden iframe".
- **M7. "fill" means paint property (61, 148) and populate (20, 72, 212, 214, 228, 376).** Write "background" at 61 and 148.
- **M8. "source" overloaded, missing from Terms:** provenance (24, 96, 139), source code (75), geometry provider (56, 92, 104, 233, 264, 447, 465, 472), font origin (229), `## Sources` (284, 423), "source hints" voter (231); `Pair.source` (129, 451) unspecified. Add "source" to Terms as the geometry provider; rename the others.
- **M9. "component" defined as rendered element (24) but used for React components (96, 98, 284, 357).**

### Rules

- **M10. Slot rule contradicts slot table (66, 204 vs 194–197).** `Segmenter`, `RoleRules`, `Pairer`, `Ranker` have one default and a "later" second. Restate the rule ("a named future implementation") or make them plain functions.

### Numbers

- **M11. "Under 1% wrong" (316) does not match the table (162–165).** Stripe finished 5/399 = 1.25%; under 1% only without the 3 truth errors; placeholder 21/399 = 5.3%. State the rows and whether truth errors are excluded.
- **M12. Performance numbers have no source (362):** OCR 0.4–0.9 s, segmentation 33 ms–1.2 s, blazediff, snapdom, rects; "bounded by the spike's 3 minutes" presents one measurement as a bound.
- **M13. pretext numbers have no record path (151).**
- **M14. Six constants named with no value:** `glyphHalo`, `interiorInset`, `unmatchedMinimum` (217), `geometryPx` (229), `tileGate` (114, 251), `runsKept` (276). State they exist in `shared/tolerances.ts` with values.

### Tables

- **M15. Four paragraphs hold rules that belong in tables:** (a) 231 pairing: voters table plus gates table (0.1, IoU 0.3, 3x, 0.6, 0.08, 0.15, 0.3, median + 0.1); (b) 268 `textDeltaAllowed`: live role × target role table, which exposes the missing case live `literal` vs target `data` with different strings, and literal equal to `unknown`/`placeholder`; (c) 230 capture path: widths × browser × stream state; (d) 276 store layout: file, contents, lifetime.

### Plan

- **M16. Bullets chain more than two assertions.** Tests: 424 (4), 437 (5), 447 (5), 460 (9), 467 (5), 423 (3). 437 has an either-or assertion ("within 0.5 px, or records the error at confidence 0.5"): one expected result. Change bullets with six or more edits: 415, 416, 419, 428, 429, 433, 442, 451, 455; item 33 mixes three packages.

## Nits

1. 22 "site slice" never used again; "sparse"/"continuous" jargon.
2. 13 vs 14, 52: conciv as widget vs "the conciv server".
3. 4, 126 "review rounds" reuse "round".
4. 79, 141 "target" as fix target and fixture shot.
5. 466 `xray/stage.tsx` is a UI component.
6. 137 "Node-only" beside "node": write "Node.js-only".
7. CUJ (86) never expanded. 8. HMR never tied to "hot-module update". 9. ppu not introduced. 10. snapdom, Region Capture, IoU not introduced. 11. Slot used before 188. 12. Voter, twin voter before 231. 13. Stage, brief before 244/251. 14. "Gates" undefined at 231. 15. "intrinsic property" (92) undefined. 16. "level 1 and level 2 containers", "image leaves", "depth-1 image leaves", "the reference dashboard" undefined. 17. "the loop spike" (45) not linked.
8. Figures without record: 37 Sonnet run, 45 "stalling for minutes", 167 "nearly every element", 216 16 px threshold, 331 9.6 px, 334 "33 to 67", "a third to a half".
9. Constants without rationale: `runDebounceMs` 150, `stallRounds` 2, `briefSize` 5, `roundBudget` 8, `residualAreaGate` 0.01, `captureFrameMs` 500.
10. 236 "about 6 renders": state the step size. 21. 389 "about 63 calls": exact count.
11. Run triggers disagree (60 vs 225). 23. Brief size wording (64, 362, 460); 362 omits the 12-row report from round cost.
12. Wording: "comes for free" (39), "breaks the selling point" (292), "Cheap and fast" (325), "obvious items" (374), "robust median" (232), "a matching page" (1, 52: define as `stop: done`), fragment at 63; mixed British/American spelling; mixed heading case; 385 mixes gates, code rules, commit policy; 476 repeats gates; 212 and 251 as small tables; 206 session rule buried in a 170-word paragraph.

## Most important fixes

1. Finish the renames; add "source" to Terms.
2. Align node, pair, mirror, component definitions with use; "twin" for slice-to-slice.
3. Correct 316; source or value for each number and constant.
4. Tables for pairing, `textDeltaAllowed`, capture path, store.
5. One `it` per item in the plan; settle 437.
