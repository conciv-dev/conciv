# Style report (Stages 7 and 9) — design-driver.md, revision 2

Reviewer: egm-style (opus). No Blockers.

## FeatureRange (1–427)

### Major

1. "engine" means the decision engine and conciv's server process (223, 400, 401, 529). Call the process "server".
2. "stage" means the loop stage and the x-ray image area (237, 270, `stage.tsx`). Rename the UI area.
3. The second stage has three names: "content and type", "content-and-type items", `content` (37, 38, 234, 310). Define once.
4. "unpaired" vs `extra` vs "unbuilt and extra share" vs `unpairedShare` (38, 238, 201, 32). One status name for a live component with no pair.
5. 388 "Pairs are decisions" blurs two defined tables. Reword: "Pairs are kept like decisions".
6. 211 says two delta kinds join; plan 571 and table 236 add `border`, never defined.
7. 233 "`moved` beyond `verifyWindow`" cannot occur (201 defines beyond the window as `missing`).
8. 41 "Marks and pairs are the x-ray's only actions" vs accept, undo, redo, replay, capture (260, 270).
9. 54 Non-Goal "the server changing the user's source code" vs undo/redo writing the tree (260, 400).
10. 65 "Open Questions" holds no questions; 67 "no unverified assumptions" is absolute. Rename "Verified Assumptions".
11. 83 vs 409: two locations for the spike records.
12. 98–99 CUJ 2: first call's `intent` unstated while 179 makes behaviour depend on it.
13. Terms before definition: brief (25), residual (25, 41), tile gate (41, 110, 238, never), Jev/Noul/Choice/Score (13, 79), HMR (93), code mode (274, 345), x-ray (11).
14. 45 "costs milliseconds" unmeasurable; give a number.
15. Sentences of 60–120 words: 13, 25, 41, 199, 203, 240, 274.
16. 13, 25, Goals and Technical Plan repeat each other; delete 25, shorten Overview.

### Nit

17. "element" ambiguous (39, 130, 75, `target_elements`). 18. "leaf" left from tree model (191, 510). 19. Pair key at 32 omits `width`. 20. 36 "boxes and styles only" vs 158 "boxes + styles + glyphs". 21. 189 "per round" for an enricher that runs at registration. 22. 43 four question types vs 244 five. 23. 401 "a brief of five items" vs 3 to 5; what decides. 24. British/American spelling mixed (colour/color, normalised/normalizes, behaviour, honours). 25. Informal wording: 284, 290, 296, 303, 19, 11, 380. 26. Unsourced: 392 "ten to fifty times", 286 "the reviews", 326 "four reviewers". 27. 244 "says `rewording` never" word order. 28. 238 area share vs per-tile gate units. 29. Diagram right border misaligned 145, 147, 161, 162. 30. Bullet markers mix `* ` and `*   `. 31. 406, 417 H3 should be H2. 32. 172 `route?` vs 600 `route`.

## DetailedRange (428–748)

### Major

1. 502 "(one call, file 23)" wrong; the render call is file 20 `render-probe.ts`.
2. 735 "Three real runs": "run" is a `runs` row; use "trials" (also 86 "fixture runs").
3. "step" means plan Step and tool step (522). Say "plan Step 4".
4. 430 one 170-word paragraph; make a list.
5. 612 `needs-width` condition with three "and"s; list it.
6. Long one-sentence entries: 456, 591, 634, 674; one bullet per case.

### Nit

7. 532, 594, 698 lack "Proposed Changes". 8. 715 "(No change)" as a file entry. 9. 512, 516 "(Modify, Create)" does not say which. 10. 674 `DESIGN_ENGINE=rules` undefined. 11. 680 `xray.decisions`, `xray.pairs` only in plan. 12. 499 "tighten edges", "border median" undefined. 13. 502 fragment. 14. Number style mixes words and numerals (488, 674, 122). 15. 743 `zz-demo-text` jargon. 16. 510 "every leaf".
