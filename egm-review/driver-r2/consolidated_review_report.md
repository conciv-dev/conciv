# Consolidated review — design-driver.md, revision 2 (2026-11-01)

Seven Goldfish reports plus the Stage 8 synthesis, all in this folder. Verdict across stages: **changes required; not ready for implementation.**

## Decisions for the author (these reverse rulings the document encodes)

| #   | Decision                                                                                                                                                                                            | Reviewers                                                                                                            | If accepted                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Rounds and the budget count only `design_diff` calls. HMR only marks the last report stale for the x-ray. A whole-page raster per call.                                                             | zoom_out B1, design B5, B6, readiness B1, B2, codebase B1, M1, M2, comprehension 3, 8, 10, structural M6, stage 8 G1 | Drop `rounds.ts`, `p-queue`, `tinypool`, debounce, settle wait, push channel, core page-handle change; Alternative M flips to accepted |
| D2  | Automatic pairs are recomputed every round by extending the existing tile matcher and `groupText`; only user pins persist as decisions.                                                             | design B1, B2, B3, M4, codebase B2, B3, M6, structural M7, stage 8 G2                                                | Live id collisions and id shifts stop mattering; `pairs` table shrinks to pins; `dom:` fallback and carry go                           |
| D3  | No undo, redo, replay, edit events or cursor in this change.                                                                                                                                        | structural B1, design B7, M8, zoom_out M2, comprehension 1, 6, 7, readiness M7, M19, stage 8 G3                      | `events`, `cursor`, `edits.ts`, `diff` dependency removed; Non-Goals 54 and 61 stand unchanged                                         |
| D4  | No decision engine in this change; roles from rules, else `unknown`; "live `expression` is never a text delta" closes the sample-data trap. Jev under Future Improvements with the trial condition. | zoom_out M3, design M3, M9, codebase N5, readiness B7, stage 8 G5                                                    | `engine/*`, `@typesafe-ai/sdk`, `TYPESAFE_API_KEY` handling removed                                                                    |
| D5  | No `match` template verification; the matcher's existing windowed edge search is the fallback.                                                                                                      | zoom_out M6, design B4, structural M3, comprehension 11, readiness M12, stage 8 G4                                   | `verify.ts`, `moved`/`missing` stage rows removed                                                                                      |
| D6  | No registry slots, carry, or `target_elements` in this change; per-width pairs plus existing `withBreakpoints` cover responsive.                                                                    | zoom_out M4, M5, design M5, readiness M8, M9, codebase M4, stage 8 G6                                                | CUJ 6 and 7 move to Future Improvements                                                                                                |
| D7  | Store: SQLite (`runs`, `nodes`, `decisions`, `targets`) or the existing file store with a decisions list; Alternative H is viable again.                                                            | structural, stage 8 §3                                                                                               | Step 1 shrinks either way                                                                                                              |
| D8  | `extra` components are informational under `match`, structure only under `build`.                                                                                                                   | design B4, stage 8 G7                                                                                                | Stage table and score change                                                                                                           |

## Blockers that stand regardless of the decisions

- Spike claims misstated (zoom_out M9, design M1, M2): recursion into image regions measured and recovered nothing; Stripe 14%/0% recall; misses are painted containers not invisible wrappers; 0–3 spurious frames and up to 8 spurious images; segmentation 357–1164ms on real pages; weight thresholds derived on coverage not density; typography measured on macOS only. Reword Open Questions and Alternatives P, S.
- Spike records are not beside the document (stage 8): copy `seg-spike/results.md`, `results-edges.md`, `font-spike/results.md` into `docs/designs/spikes/` or fix the path.
- Estimator timing (comprehension 5, structural N12, readiness M4, codebase M9): enrichers run at registration with no page access and no pairs; define the `Enricher` contract (root scope, context with page) and when size estimation runs.
- Existing tests that change (readiness M1, codebase B4): `design.it.test.ts:283`, `:325-327`, `:995-999`, `:274` (and `:379-385`, `:564-569`, `:1026/1058` depending on D1 and section 9). List each with its new expectation; "Existing tests untouched" is false.
- Fixture facts (readiness B5, B6, B7): the badge is a gradient not an element; no footer; firefox target has no photo; no `u1-1280-roles` shot. Rewrite the test items.
- Skill text (codebase M15, stage 8): `agent-guide.ts:20` already has a design bullet; replace it, and fix Overview line 11.
- `needs-route` on `build` with a user-named route (readiness B4, comprehension 2, style 12): contradicts section 1.1 and CUJ 2; drop the forced question or define the second call.
- Route test (readiness B4): the filesystem walker finds nothing in the fixture host; defer the walker or change the test.

## Majors to fold into the rewrite

- Naming: `Pair` collides (`types.ts:103`); `medianColor` collides (`raster.ts:141`); `unmatched` `missing|extra` already exists (`defs.ts:86-91`); `breakpoint` is boolean today; `TargetResult.text` renamed silently; `typography.weight` and `TargetNode.kind` are retypes.
- Delta kinds vs stage table: `border` unmeasured; `unbuilt`/`extra`/`missing`/`moved` need an item union for the exhaustive switch; `readAxis` reads the parent's flow. Stage 8 suggests deferring `axis`, `columns`, `border`.
- `tileGate` reused as an area threshold; define `residualAreaGate`; `TOLERANCES.limit` 12 vs brief 3–5.
- Security claim "no agent can call them" is false on localhost HTTP (design M7): origin check plus token, or reword.
- ppu-ocv: `matchTemplate`/`morphologyEx` are raw `cv.*`, operations are pipeline names (codebase N1); `tanstack_route_manifest.file` nullable (N6); `@types/diff` redundant (N2); `packages/db` has no `db:generate` script (N3); whiteboard precedent wording (N3, structural N6, style).
- `@conciv/skills` has no build step or `harness-init` dependency (readiness M20, codebase M15).
- Step 1 typecheck gate cannot pass with all type changes front-loaded (readiness M2).

## Style and structure (apply during the rewrite)

"engine" and "stage" each carry two meanings; the second stage has three names; `unpaired` vs `extra`; "Open Questions" holds no questions (rename "Verified assumptions and spikes"); Goals restate mechanism (trim to outcomes); Overview and line 25 duplicate; sentences over 60 words at 13, 25, 41, 199, 203, 240, 274, 430, 612; British/American spelling mixed; H3 headings at 406 and 417 should be H2; unsourced "ten to fifty times", "the reviews", "four reviewers"; dangling `pair-moved`; `route?` vs `route`; `createStore(dir)` vs `({dir, cwd})`; `target_node_id` vs `node_id`.

## Traceability

Every finding above cites its report and id; the per-stage reports in this folder hold the full text and line numbers.
