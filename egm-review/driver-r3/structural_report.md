# egm-structural review: `docs/designs/design-driver.md` lines 1–301 (revision 3)

Standard: feature-spec-standard. Verdict: needs revision. No Blockers, 9 Major, 12 Nit. Structure sound: no skipped heading levels, fences closed, tables well formed. Two standard-level gaps: no Risks & Mitigations section, incomplete alternatives.

## Major

- **M1. Risks & Mitigations missing.** Known limits stated once and never turned into a risk with a mitigation: typography unmeasured on Figma exports and Linux renders (77) while Figma export is a trigger word (220); segmentation recall 0–14% at level 2 on Stripe (76); takumi subset gaps and p95 25 px on conciv.dev (78); Screen Capture permission denial (181); mirror out of date (244). NFR covers security, performance, rollback, not failure modes.
- **M2. Overview, Goals, CUJ 3 and Plan §3 repeat the same content** (13 vs 29–32 vs 99 vs 182; 15 vs 33–38). The width-invariant property list appears three times and has drifted: line 13 has "fill" and "ink color", line 99 has "colors" and drops fill. Cut the Overview to problem and approach; keep property lists in the Plan only.
- **M3. "Fill" means two things** (13 vs 199): a paint comparison in the Overview, a geometry stage item in the table, `fills.background` a paint fact.
- **M4. Source precedence contradicts the plan** (32 vs 182, 235, 244). Takumi and the mirror are mutually exclusive per page, so "mirror over takumi" never applies; the only other source is DOM at a different width. Alternative F still cites "a mirror out of date" as a disagreement case. Either both run, or reword precedence and disagreement.
- **M5. Goal "three real trials" (41) traces to nothing**: no plan section defines a trial or its pass condition; Future Improvements (293, 298) depends on trials.
- **M6. Plan §9 and CUJ 6 have no Goal** (113–117, 222–224). Add a Goal with a Problem link, or move the sweep to Future Improvements.
- **M7. Slot inventory contradicts verified assumptions** (63 vs 142–158). `GeometryEstimator`, `ColorMetric`, `Matcher` named as existing slots and absent from the table (removed, replaced by `Pairer`, kept?); `TargetStore` listed as a slot at 63 and "not a slot" at 158; `Capture` "(exists)" at 150 but missing at 63.
- **M8. Rulings never listed or linked** (4, 181, 189, 232, 238, 244, 247). Alternative I (253) says "Alternative H of revision 2 is the choice" while this revision's H is the rejected persistent-pairs option.
- **M9. Alternatives incomplete**: mirror-only geometry without takumi (avoids the subset scanner, 6.8 MiB wasm, a second source; the spike itself says takumi's gain is isolation not speed); snapdom-only capture without the permission prompt.

## Nit

- N1. Estimate timing: CUJ 1 (86) has `design_target` estimate typography; Plan §2.3 (172) says first round.
- N2. Round triggers: Overview and Goal 8 name two; Plan §3 (178) adds pins, marks, acceptance.
- N3. Target `literal` role has no source (37, 208 vs 173).
- N4. `axis` never defined (39, 154, 197); say how `axis`/`columns` target sides avoid Non-Goal 47.
- N5. Non-Goal 56 reads as if constraint hints exist; Future Improvements 296 says not built.
- N6. CUJ 3 (99) has "widths" measured into geometry rows; CUJ 1 (87) and Non-Goal 54 say rows never name a width.
- N7. "content and type" (15) vs `content` (198).
- N8. Brief "3 to 5" (38, 202) vs "five sentences" (279).
- N9. Goals without a CUJ: hierarchical alignment and ordering (33), pins (36), `border` and the mask (39). The overlay is in the Overview but not a Goal.
- N10. Ordering: "Verified assumptions and spikes" splits Goals from CUJs; Future Improvements after Additional Resources.
- N11. H3 only for "Spikes" under its H2; Alternatives A–P lack a blank line after the H3.
- N12. Spike paths relative at 76–78, absolute at 284; OCR record (75) is not in `docs/designs/spikes/`; Alternative M's "9.6 px" (265) is not in the typography summary (77).

## Non-Goals vs plan

No direct contradictions. 47: the Pairer (183) never uses `within`; use it or drop "pairing hint". 50: `revoke`/`unpin` are not undo. 52: re-registering identical bytes is not carry. 46: the mirror is scriptless.
