# Comprehension report (Stage 6) — design-driver.md, revision 2

Reviewer: egm-comprehension (opus). FeatureRange 1–427, DetailedRange 428–end.

## What this proposes

A "design driver" for the conciv design extension. It takes a sentence like "make /invoices match this image" with a PNG and drives the existing tools (`design_target`, `design_diff`, `design_status`) until the page matches or a server-decided stop reason fires.

- Route and intent: `design_target` resolves the route through a cascade (user, manifest tool, filesystem walk, ask) and returns a closed outcome (`ready`, `needs-route`, `needs-width`), writing nothing until `ready`. Intent is `match` or `build`.
- Reading the image: a flat list of target nodes (boxes from threshold segmentation, text from OCR, font size and weight by rendering the same text in the live font). No hierarchy inferred.
- Pairs and deltas: each live component (`data-conciv-source`) is paired with target nodes; pairs persist; every delta is measured through a pair.
- Rounds: one per settled HMR update; boxes and styles only, clipped screenshots for paint checks; each round yields stage, brief (3–5), score tuple, stop reason.
- Storage and judgment: design-owned SQLite with an append-only event log; x-ray timeline with replay and undo/redo; a `DecisionEngine` (rules by default, Jev with an API key) for questions rules cannot settle.
- Delivery: skill text and tool descriptions updated so agents trigger on design requests.

## How the existing system works, per this document

- The extension registers a PNG for a route and width, diffs the live page against it, reports deltas with source locations, and shows results in the x-ray. The image adapter makes one root node with OCR text as flat leaves.
- The target side carries only background and colour from pixels; `TargetNode` has `fills`, `typography` and `layout` fields nothing fills or reads.
- Runs are timestamped JSON files under `.conciv/design/<id>/`, pruned to 20. No pairs, decisions or round numbers.
- The hidden capture frame loads the tab's URL. `CONCIV_COMMAND_GUIDE` has no design trigger, route finding, fix order or stop rule.

## Findings

1. **Major** (41, 42, 260, 400, 680): the x-ray "never edits source" yet undo/redo apply patches to the working tree; Non-Goal 54 ("the server changing the user's source code") also conflicts. The boundary is undefined.
2. **Major** (99–100, 174, 179, 628): the `build` second call contradicts itself. `build` + `route: '/'` returns `needs-route` with edit-or-create; "the second call with `route` returns `ready`" looks identical to the first. Missing: what distinguishes the second call, the intent sent on "edit", who picks the path for a page that does not exist, how the hidden frame and the HMR dependency trigger work before the file exists.
3. **Major** (223, 238, 240): `residualShare` is measured on the last whole-page raster, which is taken only on registration, acceptance or the button. The residual the stop rule reads is frozen while the agent edits; under `build` it is the raster of an unbuilt page. How `done` is reached without a manual capture is not explained.
4. **Major** (41, 56, 110, 238, 240): "tile" and `tileGate` are undefined and `tileGate` is absent from section 12; line 240 compares an area share against a per-tile threshold.
5. **Major** (144–148, 189, 502): the estimator runs at enrichment (before route, pairs and rounds) yet is described as batched per round, using the paired component's font and the hidden frame's document. On `needs-route` there is no route to load. Whether estimates are recomputed once pairs exist is unstated.
6. **Major** (260, 642): no baseline snapshot for a file's first edit; a file joins the changed set only after `hmr-update`, so the first `edit` event and its reverse patch cannot exist.
7. **Major** (42, 112, 258, 260): undo writes the tree, fires `hmr-update`, triggers a round that records the undo as a new edit and run. Cursor interaction, redo after a new edit (branch or truncate), and whether undo rounds count against the budget are unspecified.
8. **Major** (36, 219–221, 240): `round` counts runs from three sources (HMR saves, `design_diff`, x-ray marks); a user making marks or saving files 150ms apart spends the budget of 8. What one budget unit means is never said.
9. **Major** (30, 179, 346): the `needs-width` trigger condition appears only in the plan (612); the feature text cannot predict it.
10. **Major** (13, 36, 209, 223): the purpose of the clipped paint screenshot is unexplained; section 4 reads paint from node fields and computed styles, section 5 captures pixels without saying what they are compared against.
11. **Major** (33, 201, 233, 235): verification runs at registration only but `moved`/`missing` are staged per round; "moved beyond `verifyWindow`" cannot occur because beyond the window is `missing`. Whether they are re-evaluated later is unclear.
12. **Nit** (34, 211, 236, 571): two new delta kinds in Goals and section 4, three (`border`) in the stage table and plan; `border` measurement never described.
13. **Nit** (238, 240, 662): "compared stage by stage" ambiguous (lexicographic or every component); demotion versus `stalled` order unstated.
14. **Nit**: undefined terms: conciv, x-ray, code mode, hidden frame, bundler bridge, paddle reader, glyph runs, `captureGeneration`, `pickRuntime`, Noul, fallow audit, EGM/Goldfish.
15. **Nit** (188, 199, 201, 219, 262): existing tolerances (`glyphHalo`, `unmatchedMinimum`, `interiorInset`, `geometryPx`, `colorDeltaE`, `frameSettleMs`, `runsKept`) referenced without values; section 12 lists only new constants.
16. **Nit** (286, 326): "the two blockers the reviews found", "four reviewers preferred it" refer to reviews the reader has not seen.
17. **Nit** (72, 248): migration precedent stated both ways (whiteboard versus core's `migrations.gen.ts`); `createStore(dir)` versus `createStore({dir, cwd})`.
18. **Nit** (529, 674, 591): `DESIGN_FAKE_ADAPTER`, `DESIGN_ENGINE`, fixture variants `badge`/`firefox`/`text-changed`/`target`, and question ids `textRole`/`textTriage`/`pairTie`/`nodeCarry`/`residualAccept` first appear in the plan.

Overall: every section can be paraphrased; the gaps are in how parts connect (build path, residual freshness, estimator timing, edit baseline, undo semantics, budget accounting).
