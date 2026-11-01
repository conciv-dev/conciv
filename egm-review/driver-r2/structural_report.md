# Structural report (Stage 7) — design-driver.md, revision 2

Reviewer: egm-structural (opus), feature-spec standard, lines 1–427. Section order, heading nesting, Technical Plan 1–12 and Alternatives A–S pass; cross-references at 85, 190, 225 resolve. Problems are content contradictions across sections.

## Blocker

- **B1** (41, 54, 61 vs 260, 270, 400): x-ray "never edits source" and Non-Goal "server changing the user's source code" vs undo/redo applying patches to the working tree. Either state the exception in Goal and Non-Goal or undo stops writing files.

## Major

- **M1** (32, 41 vs 270): Goals say "the user and the agent" mark and re-pair from the x-ray; section 10 says no agent can call those routes.
- **M2** (37, 298 vs 225, 238, 256): stage "recomputed from the report alone" and "never stored" vs `stage` column on `runs` and demotion from run history.
- **M3** (233 vs 201): "`moved` beyond `verifyWindow`" cannot occur.
- **M4** (236): `border` delta kind never introduced; 211 says only `axis` and `columns` join; weakens the exhaustive-switch claim.
- **M5** (234, 37): stage literal `content` vs "content and type"; `stage` is a field the skill reads, pin it.
- **M6** (36 vs 220, 225): `design_diff` "returns the current round, waiting", "enqueues a round if none is pending", "returns the newest run's report" are three behaviours.
- **M7** (197): dangling `pair-moved` rule; not in event kinds at 257.
- **M8** (30 vs 179, 177): `{kind: 'none'}` outcome unmapped (error or `needs-route` with no candidates); `needs-width` condition elided; diagram 147 lacks the `none` and error branches.
- **M9** (112): CUJ 4 "done while nothing is worse than the accepted residual" has no backing in section 6 stop rules.
- **M10** (65–86): Open Questions holds verified facts and spike results, not questions. Say "None" and move the rest to "Verified Assumptions and Spikes".
- **M11** (29–46): Goals restate mechanism and tuning values (33, 36, 40, 43, 44) that sections 3, 5, 7, 8, 12 repeat, and the copies have drifted (N1, N2, N5).

## Nit

- N1 (44 vs 278): Goal slot list includes text reader and delta kinds; section 12 adds five and does not say the two exist.
- N2 (39 vs 205, 253): widths joined by "name" vs "route"; `target_elements` columns differ between sections 3 and 8.
- N3 (203 vs 254): `target_node_id` vs `node_id`; Goal 32 omits `width`.
- N4 (35 vs 213): live role `expression` not in the Goal's role set; nothing produces `unknown`.
- N5 (74 vs 266): `client/capture.ts` `frameAtRoute` vs `captures/tab.ts` and `client/frame.ts`.
- N6 (72 vs 248): whiteboard vs core migration precedent.
- N7 (401): "a brief of five items" vs 3 to 5.
- N8 (201): `unpaired` vs `extra`.
- N9 (29 vs 274): Goal promises CLI help text; section 11 covers tools and skill only.
- N10 (106): "the diff image masks excluded regions" has no counterpart in 5, 6, 8.
- N11 (191): "every leaf".
- N12 (189): estimates "per round" at registration.
- N13 (136–168): diagram omits the engine, the worker pool and the registration raster; `routes.resolve` vs `resolveRoute`.
- N14: colour/color mixed.
- N15: "no residual stage" stated three times; Non-Goals 52, 57, 62 repeat Alternatives G, I, S.
- N16 (286, 326): references to reviews the reader cannot see.
- N17 (13): Overview restates the Technical Plan.
