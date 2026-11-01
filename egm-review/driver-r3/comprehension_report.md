# egm-comprehension review: `docs/designs/design-driver.md` (revision 3)

Mode: REVIEW. FeatureRange is lines 1–301 and DetailedRange is lines 302–396. Checked terms against `docs/designs/spikes/*.md` (file list only) and `packages/extensions/design/src/shared/` (`tolerances.ts`, `README.md`, `above.ts`).

## What this proposes

The proposal adds a driver loop around the existing design tools so that a coding agent given a PNG can work towards a page that matches it. Registering the image makes it the session's current target. The image's own size sets the target width, and the route is only a label. Text runs are read with OCR and boxes with segmentation, both in a worker in the app tab. Typography is estimated by rendering the run's own text in the live font. A text role (literal, placeholder, data, unknown) is assigned by rules.

A round runs each time an HMR update settles and each time `design_diff` is called. In each round the system:

1. captures pixels in the browser (Region Capture, or snapdom as a fallback);
2. measures geometry that depends on width at the target width, using takumi plus pretext, or a scriptless mirror iframe filled by rrweb;
3. pairs live components with target nodes again using rules;
4. aligns them hierarchically and computes deltas, each tagged with its source and a confidence;
5. sorts them into four stages, scores them, and returns a brief of 3 to 5 items and a stop reason.

The x-ray becomes an overlay inside the app tab, where the user pins pairs, marks regions, sets tolerances and accepts runs; only those decisions persist. Each piece is a replaceable "slot" in a registry. The plan has seven steps, and each step's gate is the integration tests in `design.it.test.ts`.

## How the existing system works, per this document

Today `design_target` registers an image keyed by route and width. `design_diff` takes a width and renders the app a second time in a hidden iframe at that width (`frameAtRoute`). The spike saw this stall when the tab was hidden. `design_status` reports whether the page is clean, and the x-ray is a separate document that shows rows.

Against a PNG, the only deltas that fire are text, background, foreground, geometry and unmatched regions. There is no `border` kind. The diff image ignores the agreeing-text mask that the score applies. Pixels go stale between diffs.

The agent guide has a single bullet about design. Nothing tells the agent that a target exists, what to fix first, or when to stop, and in one observed run the agent never called `design_diff`.

Slot types, `REGISTRIES`, `pickRuntime` and `designConfig` already exist, along with `Pair`, `Unmatched` (missing | extra), an OCR reader and a file store.

## Findings

### Major

1. **"Ruling N" is used as a justification but the rulings are never listed.** Lines 4, 181, 189, 232, 238, 244, 247. No list and no link; a reader cannot check rulings 3–6 and 9–11.
2. **Which geometry source applies, and when two sources can disagree, does not hold together.** Lines 13, 32, 99, 182, 185, 244. Line 32 says DOM rects at the live width win per property, but width-dependent geometry is measured at the target width, so DOM cannot win for x or widths when widths differ. Line 182 picks either takumi or the mirror, so only one width-dependent source runs; which two sources ever produce a `disagreement` row is unclear. The paraphrase had to guess that precedence applies to width-invariant properties only.
3. **The loop silently needs the overlay to be open.** Lines 27, 160, 181, 189, 216. The overlay owns the measurer and the worker; the capture stream lives while the overlay is open; CUJ 1 promises no setup. What a round does when the overlay is closed, minimized or covered, and whether `design_target` opens it, is unstated.
4. **"Session" is never defined.** Lines 28, 48, 164, 212, 325. Agent conversation, tab, or process; what starts or ends it; where `session` comes from on an x-ray route.
5. **Item identity across rounds is undefined.** Lines 52, 183, 202, 204. Pairs do not persist, yet demotion, `oscillating` and `stalled` compare the same item across runs. The key (anchor plus kind, `data-conciv-source`, node id) is not stated.
6. **The text-role rule leaves cases open, and target `literal` has no origin.** Lines 37, 173, 208, 103–105. Default rules produce only `placeholder`, `data`, `unknown`, but line 208 branches on target `literal`. Unspecified: live `literal` vs target `placeholder`; live `literal` vs target `data` with different strings; whether a `sample-data` row counts toward stage counts and blocks `done`.
7. **The `dynamic` mark has no described effect; `excluded` vs `image-slot` not distinguished.** Lines 36, 104, 186, 212.
8. **Stage table uses undefined delta kinds; `fill` conflicts.** Lines 13, 197–200, 20. `inset-*`, `gap-*`, `align`, `fill` undefined; `fill` sits in the geometry stage but line 13 lists it with paint-like properties and `fills.background` is a color.
9. **`unbuilt` vs `Unmatched.missing` not stated.** Lines 64, 185. Renamed, removed or kept alongside?
10. **"Design panel that is the mirror document" reads as a contradiction.** Lines 182, 216, 373. The mirror is the live DOM at the target width; where the target image is displayed is unstated.
11. **The `badge` fixture facts conflict with the tests built on them.** Lines 318, 367, 374, 295. A gradient inside the header is not a separate element, yet tests pin "the `extra` badge region" to a card node and expect `stage: 'paint'` while gradient is a future delta kind.
12. **Undefined core terms**: x-ray (11, 87, 216), conciv and the conciv widget (14, 27), tile / tile gate / tile matcher (49, 109, 202, 259), agreeing-text mask (23, 39, 189).
13. **Jev / TypeSafe Jev never explained or linked.** Lines 15, 51, 76, 208, 255–256, 289, 293.
14. **Unclear whether every round spends budget.** Lines 178, 204. Do pins, marks or no-op saves consume the 8 rounds?
15. **Line 253 self-contradictory.** "Alternative H of revision 2 is the choice" inside Alternative I while this document's Alternative H is rejected; revision 2 is not available to the reader.

### Nit

16. "Two blockers" (229) not set up in The Problem.
17. "The spike" (21, 164, 172, 178, 182) ambiguous among four spikes.
18. Constants without values in the document: `glyphHalo`, `unmatchedMinimum`, `interiorInset`, `geometryPx`, `runsKept`, `tileGate` (171, 185, 202, 212).
19. `briefSize` "3 to 5" (38, 202) vs constant 5 (364); the rule picking 3 is unstated.
20. Line 151: `server/comparators/blazediff.ts` "run in the worker"; how a `server/` file runs in a browser worker, or whether it moves (step 13 moves only paddle).
21. Enricher order vs registration (168–174): Estimates listed third "in this order" yet runs on the first round.
22. Unexplained names: EGM (4, 287, 379), `fallow` (304), "Claude Fable 5.1" (304).
23. Fixture names `u1-1280` and `firefox` (318): "u1" unexplained; `firefox` never used later.
24. Capture occlusion unstated (181): does the overlay pane cover the page being captured?
25. External libraries without links (13, 67).
26. "Provenance site" (173, 156) undefined.

No Blocker. Every section could be paraphrased; findings 2, 3 and 5 required guessing.
