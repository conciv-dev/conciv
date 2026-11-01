# egm-style review: `docs/designs/design-driver.md` (revision 3, all 396 lines)

Verdict: revise. 0 Blockers, 21 Majors, 23 Nits. Prose is dry and mostly free of marketing language. The real problems: key words carry two or three meanings, some terms and "rulings" are never defined, a few numbers have no source, long semicolon sentences hold rules that would be clearer as tables.

## Part 1: feature spec (1–301)

### Terms with two meanings

1. Major, "engine" (13, 51, 121, 250, 255): takumi layout engine, the conciv server process, a decision engine (Jev). Rename the server ("server process"), keep "engine" for takumi only or drop it.
2. Major, "source" (11, 13, 22, 32, 50, 68, 76, 78, 99, 149, 182, 185, 289; 326, 355): code location, geometry provider, font file, origin of facts, fixture file. The anchor `{node} | {source} | {box}` (326) is unreadable. Reserve "source" for geometry providers; "code location"/"provenance" for code; "font files" for fonts.
3. Major, "mirror" (13, 46, 182, 235, 351): the mirror document vs rrweb's mirror (node-id map), both in one sentence at 182.
4. Major, "frame" (21, 66, 76, 234, 268, 279): hidden iframe, spurious box, captured video image. Use "spurious boxes", "capture".
5. Major, "round" vs "run" (4, 15, 34, 36, 41, 77, 109–110, 202, 204, 384): iteration vs stored result mixed (`stallRuns` "2 consecutive runs", `round` counts runs); "run" also OCR text run; "trials" become "real runs"; "review rounds". Define once; rename text runs ("text spans").
6. Major, "residual" (33, 55, 107, 184, 202, 271): per-container alignment shift vs leftover pixels. Rename the alignment one ("local offset").
7. Major, "fill" (13, 199, 166): paint property, geometry delta kind, `fills.background`, and "filled by rrweb".
8. Nit, "stage" (15, 198, 373): "content and type" vs `content`; `xray/stage.tsx` is a UI component.
9. Nit, "target" (54, 66): "fix targets", "a trial target".
10. Nit, "score" (23, 189 vs 202): pixel score vs the tuple.
11. Nit, "unbuilt" vs "missing" (64, 185).

### Undefined before first use

12. Major, "ruling N" (4, 181, 189, 232, 238, 244, 247): never listed or linked.
13. Major, terms before definition: x-ray (11, defined 214), EGM (4), conciv / conciv widget (13), TypeSafe Jev and "the same two slots" (15), "the spike" (21), hidden frame (21), agreeing-text mask (23, never defined), CDP (13), HMR (69) not tied to "hot-module updates" (15).
14. Major, constants and mechanisms without definition or value: tile gate (109, 202), the tile matcher's windowed search (49, 259), `glyphHalo`, `interiorInset`, `unmatchedMinimum` (171), `geometryPx` (185, 224), `runsKept` (212), "level 1 and level 2 containers" and "image leaf" (76), "intrinsic property" (87), "a 400 reference" (77, 172), "SF Pro shaping drift" (78).
15. Major, "Alternative H of revision 2 is the choice" (253) contradicts this document's H.
16. Nit, "CUJ" (81) never expanded. 17. Nit, "the two blockers" (229).

### Sentences over 60 words

18–24. Major: lines 66 (~80), 171 (~69), 182 (~60), 204 (~65), 212 (~65), 216 (~66), 220 (~70). Lists or tables. 25. Nit: 13, 172, 224 dense (53–55).

### Unsourced numbers

26. Major, 79: pretext "0.5% of paragraphs", "40 KB", no record path.
27. Major, 256: "209 to 357 ms", "well under a cent" without source.
28. Major, 274: "ten times faster loops".
29. Major, 279: OCR "0.4 to 0.9 s" not in the OCR summary at 75; blazediff "tens of milliseconds" unsourced; "about 49 renders" vs 49 sizes plus a 400 reference.
30. Nit: 265 "9.6 px" not in summary at 77; 11 Sonnet run no record; 21 "stalling for minutes" no figure; 4 vs 287 two vs three review dirs; constants `roundBudget` 8, `stallRuns` 2, `residualAreaGate` 0.01, `roundDebounceMs` 150 without rationale.

### Lists and tables

31. Major, 204: stop reasons as a table (reason, condition, who acts next).
32. Major, 38 vs 202 vs 364: brief "3 to 5" vs `briefSize` 5 vs "five sentences". Pick one.
33. Nit, 76, 78: per-site and per-width numbers as small tables. 34. Nit, 178: triggers as a list. 35. Nit, 226–274: alternatives as a table; no blank line after H3.

### Spelling, wording, consistency

36. Nit, 148 "neighbours" (British). 37. Nit, vague wording: "comes for free" (13), "Exact pixels and exact layout" (232), "Cheapest" (229), "Measured cheap and fast" (256), "robust median" (184), "obvious items" (293), "Every moving piece" (40, 140), "strategy in function form" (160), "Judgment calls are rules now" (15). 38. Nit, "a matching page" (1, 27) not measurable until `stop: done`. 39. Nit, "sample data hard-coded" (37) vs `sample-data` (208); an equal-string "text delta" is confusing. 40. Nit, `REACT_REFRESH_DEBOUNCE_MS` (178) vs `reactRefreshDebounceMs` (364). 41. Nit, `design_target` vs `design target` (220). 42. Nit, heading case mixed.

## Part 2: implementation plan (302–396)

43. Major, 314 (~82 words): four test titles plus three outcomes; a table (test, line, new expectation) for 306–316.
44. Major, 344 step 20 (~70): `within` field vs "within 0.5 px"; one sentence per assertion.
45. Major, 355 step 28 (~75): "source" two meanings, "run" overloaded; one bullet per `it`.
46. Major, 367 step 37 (~85): six assertions chained.
47. Nit, 373 step 40 dense. 48. Nit, 304 mixes gates, code rules, commit policy; gates repeated at 388–390. 49. Nit, 318 names `firefox` outside the list of four targets. 50. Nit, "trials"/"real runs"/"real trials"; "called ready" undefined. 51. Nit, 337, 341–342: `server/enrichers/*`, `server/sources/subset.ts` under `server/` though the work runs in the tab; say directories are not processes. 52. Nit, "### Verification Plan" is an H3 sibling of steps; step heading case differs.

## Most important fixes

1. One meaning each for engine, source, mirror, frame, residual, round/run, fill.
2. List the rulings; define terms and constants before use.
3. One brief size.
4. Tables for stop conditions, store layout, test mapping, loop assertions.
5. Sources for pretext, Jev cost, "ten times", OCR and blazediff numbers.
