# egm-structural review: `docs/designs/design-driver.md` lines 1–382 (revision 4)

Standard: feature-spec-standard. Verdict: needs revision (minor). 0 Blockers, 7 Majors, 12 Nits. Heading hierarchy clean, fences closed, tables parse; Problem, Goals/Non-Goals, Architecture, Alternatives A–S and Risks present.

Round 3 status: resolved M1, M3, M4, M6, M8, most of M9, N1, N3, N5–N8. Partly open: M2 (repetition), M5 (trials), M7 (slot inventory). Open: N2, N9, N10, N11, N12.

Problem to Goal coverage: every Problem item has a Goal (P1: 52, 60, 64; P2: 61, 63; P3: 53–56; P4: 60; P5: 65; P6: 57). Reverse fails: Goals 58 (slice pairing), 59 (alignment), 62 (pins, marks, accept) answer no Problem; Goals 66, 67 are constraints, not outcomes.

## Majors

- **M1. Typography estimated after the deltas that depend on it (227–236, CUJ 1 91).** Run step 10 comes after step 7 (fontSize, lineHeight, fontWeight deltas) and step 9 (score). First report has no target typography. Move it between pairing (5) and deltas (7), or say the first report lacks typography rows.
- **M2. Mirror defined at one width, needed at others (104, 272, Terms 22, 228).** CUJ 3's carry needs the mirror box at 1392; §6's heat map needs predictions between design widths; Terms 22 says "any other". State which widths the mirror is laid out at and when, or whether the `dom` source stands in at the live width.
- **M3. Target side of `axis` and `columns` unplanned (65, 246, 212, Non-Goals 73, 79).** Target model has no layout fields; nothing says how a design-side axis or column template is derived (e.g. from paired siblings' positions) or how a `columns` delta on `200px 1fr` avoids Non-Goal 79.
- **M4. Slot rules contradict each other and the table (66, 204, 190–202, 128, 276).** Goal 66: slot where two implementations are named; 204: plain function until a second exists. `Segmenter`, `RoleRules`, `Pairer`, `Ranker` pass one and fail the other. `TargetStore` listed as slot type at 128, plain function at 204. `Enricher` and `ColorMetric` missing from the table. Goal 66 says `pickRuntime`, but `Capture` and `GeometrySource` use a client registry.
- **M5. Goals repeat Overview and Non-Goals; one restatement drifted (39, 54, 55, 60, 71–72, 225, 253, 310).** "Rounds count on `design_diff`" appears five times. Goal 60 names two run triggers, 225 names three. Goal 55 omits the user-click stream requirement of 230.
- **M6. Trials gate three decisions but have no pass condition (67, 307, 349, 374).** Dropping takumi, lowering typography confidence, adopting Jev all depend on trials; no measurable outcome stated.
- **M7. Risks incomplete; spike records missing (145, 152–168, 345–357, 362).** Unmitigated: pairing time (minutes per run, queued per save), the twin voter hurting when copy and layout differ, rrweb replay drift (insertRule, adopted stylesheets, canvas). `docs/designs/spikes/` has no record for `pair-spike`, `interp-spike` or pretext, which back the pairing table and rulings 14, 17, 19.

## Nits

- N1. Goals 58, 59, 62 have no Problem item; alignment, `border`/`axis`/`columns`, pins have no CUJ.
- N2. Table rows do not sum: dashboard empty 3+0+0+132 = 135 ≠ 136; MDN placeholder 532+4+17+64 = 617 ≠ 621.
- N3. Alt J "under 1% wrong" vs Stripe 5/399 = 1.25%.
- N4. Missing alternatives: one-shot `rrweb-snapshot` per run vs live record+Replayer; x-ray as separate document; optimal assignment vs greedy.
- N5. Weak rejections: Alt E no cost; Alt K "fights the loop" vague; Alt D rests on a ruling.
- N6. `Pairer` contract takes `components`, yet §6 pairs nodes with nodes.
- N7. `within` never named in the voters (212 vs 231).
- N8. "run" vs "text run" ambiguity (149, 236).
- N9. The mirror is a persistent precondition, not a numbered run step (228).
- N10. Future Improvements after Additional Resources; "Verified assumptions" sentence case.
- N11. No blank line after Alternative H3 headings.
- N12. Diagram line 178 one character wide; spike path styles mixed; PR #683 and commits not linked.
