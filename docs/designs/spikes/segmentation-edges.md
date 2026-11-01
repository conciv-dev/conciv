# Edge-based segmenter and Jev pruning: measurement

Date 2026-11-01. Follow-up to `results.md` (same pages, same truth JSON, same metrics; nothing re-rendered).

## Verdict

**Neither `edges` nor `edges+jev` meets the bar on any real page, and neither beats `threshold-rgb-adaptive` overall.**
`edges` buys recall on the real pages (Guardian 52% to 71%, Stripe 14% to 30%, conciv.dev 47% to 53%) but pays 33 to 67 spurious frames per page against 0 to 3.
Jev removes only about a third to a half of those spurious frames (40 to 27, 67 to 26, 33 to 19) and drops 1 to 3 true containers on the way.
A one-line rule ("a border step on all four sides") removes far more spurious frames than Jev (to 2 / 8 / 2), at a recall cost.
With the Hough line rectangles on, `edges` also fails the fixture bar (table rows the DOM does not paint); with them off (`edges-nolines`) the fixtures pass.

| bar                                            | threshold-rgb-adaptive | edges                                                                                                                   | edges+jev                                 |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| fixtures: 7/7 (2/2) at 2 px, 0 spurious frames | pass (3/3 pages)       | FAIL: 100% recall, but 2 and 1 spurious frames on u1-1280 / u1-390 (table rows from line rectangles); plain-1280 passes | FAIL: same 2 / 1 table rows kept by Jev   |
| conciv.dev: L1 and L2 >= 90% at 2 px           | FAIL (L1 50%, L2 57%)  | FAIL (L1 42%, L2 57%, 40 spurious frames)                                                                               | FAIL (L1 42%, L2 57%, 27 spurious frames) |
| Stripe: >= 70% at 4 px, < 3 spurious           | FAIL (14%, 1)          | FAIL (30%, 67)                                                                                                          | FAIL (22%, 26)                            |
| Guardian: >= 70% at 4 px, < 3 spurious         | FAIL (52%, 3)          | FAIL on spurious (71%, 33)                                                                                              | FAIL (67%, 19)                            |

The full verdict table with every variant is below, under "Tables".

## What was built (`segment.ts`, `EDGE_CONSTANTS`, `edgeCandidates`, `edgeTree`)

1. Grayscale, Sobel magnitude (plain loop, divided by 4 so it reads in grey levels), then the largest absolute change of that magnitude to a 4-neighbour. Binarized at a fixed 4 (`edges`) or Otsu (`edges-otsu`). Otsu lands at 52 to 77 on every page because the map is almost all zeros, and loses most container edges (29% recall on the fixtures): fixed 4 is kept.
2. Text removal on the binary map with OpenCV `connectedComponentsWithStats` (8-connected): drop components with both sides under 24, or height under 20 with aspect over 1.5. One addition: components 6 px high or less are kept, because a binarized straight edge is a 4 px band and the rule as written deleted every horizontal border and band boundary.
3. Candidates: (a) bounding boxes of the remaining components; (b) rectangles from `cv.HoughLinesP` (present in ppu-ocv 4.0.0; `LineSegmentDetector` is not), theta pi/2, 24 votes, min length 24, gap 2; collinear segments within 3 px merged; the page edges added as virtual lines; two horizontals with matching ends plus two verticals closing within 4 px make a rectangle.
4. Recursive X-Y cut of the text-free map, from the page and inside every snapped candidate (inset 4 to step past its own edge band), cutting at empty runs of 4 px or more. A piece clipped by the region it was cut from is grown back to the region's edge before snapping (without this the flush toolbar button was lost).
5. Snap: the binary band reaches 2 px outside a real edge, so boxes are first shrunk by 2, then each side moves to the row or column within +-2 px with the largest mean RGB step; ties within 50% of the best go to the outermost (so a 1 px border is inside the box).
6. Size filter (both sides >= 24), drop the page box, collapse boxes that are identical after snapping, then (for `edges+jev`, Jev here) drop duplicates within 2 px keeping the larger.
7. Classification: a candidate with no candidate inside it and an interior under 50% uniform is an `image` leaf, unless its median equals its parent's fill with no border on any side, which is read as large text and dropped. Everything else is a `frame`. Nesting by containment; anything inside an image leaf is dropped.

Control variants, measured with the same report: `edges-nolines` (step 3b off), `edges-4side` (keep a frame only if all four sides have a border step: at least 60% of side pixels step >= 12 in summed RGB), `edges-otsu`.

## Jev (`jev.ts`)

`@typesafe-ai/sdk` 0.7.0, `client.systemOne`, model reported `jev-1.14.0`. State: page size, units and "boxes found by an edge detector on a screenshot". One `noul` per frame candidate, with structured instructions `{candidate: {x, y, width, height, aspect, level, children, textComponents, uniformity, borders: {top, right, bottom, left}, parentFillDistance}, question}`, and the question verbatim from the brief. Image leaves are not asked. Every page fit in one request (largest: Stripe, 93 questions, 16.6k input tokens). Answers are cached in `out/jev-<page>.json` by a hash of the request, so reruns do not bill unless the candidates change. Keep threshold 0.5.

- Cost: 42,211 input and 4,104 output tokens for all seven pages. Per real page 8.5k to 16.6k input tokens. No price list was consulted; the API reports tokens only.
- Latency: 209 to 357 ms per request regardless of question count (2 to 93), one request per page.
- Separation is weak: the spurious frames Jev kept average noul 0.62 to 0.67, and the true containers it dropped sit at 0.40 to 0.47. It drops small pill buttons (117x24, aspect 4.9, one text component) as "text lines", and keeps XY-cut merges (a row of three cards, 1122x175) and full-width line bands (1279x754, 90 text components) as sections. Without the image, the features cannot tell a button from a text line or a card row from a section.
- A part of what it "kept spurious" on conciv.dev are real cards found 6 px wide of the truth (the X-Y piece starts at an outside decoration): those are snapping misses, not Jev errors.

## What failed and why

The second-derivative map does what it promised on gradients: on Stripe 5 of the 9 gradient elements come out as frames (IoU > 0.8) where the threshold method made 3 of them image leaves, and level 2 and 3 recall rises from 0% to 25% and 33%. It fails on precision because the candidate generators are generous by design and nothing that sees only geometry and a few statistics can prune them: X-Y cuts emit every row of sibling cards as a merged box, Hough rectangles between the page edges and any full-width line emit page bands, and photos and large text (45% to 87% of text edge pixels survive the 24 / 20 px text rule on real pages, all of it headings above 20 px) emit blobs. Snapping +-2 px cannot fix boxes that start at an outside decoration, so some true cards count both as missed and as spurious. Jev on text-only features behaves like a soft prior (most answers 0.4 to 0.8) and does not separate container from merge; the 4-side border rule separates better but loses borderless cards and buttons. Overlays: `out/<page>.edges.png`, `out/<page>.edges+jev.png` (plus `.edges-nolines`, `.edges-4side`, `.edges-otsu`), same colours as before: green frame, red image leaf, blue truth container missed at 2 px. The Stripe and conciv.dev overlays show the merged rows and page bands most clearly.

## Rerun

`node --experimental-strip-types spike.ts edges edges-otsu edges-nolines edges-4side edges+jev && node --experimental-strip-types report-edges.ts` (needs `TYPESAFE_API_KEY` for uncached Jev requests). `spike.ts` with variant names merges into `out/results.json`; `out/results.before-edges.json` is the untouched copy from the first spike.

## Tables

### Verdict against the bar

| page (bar)                                    | threshold-rgb-adaptive                              | edges                                                | edges-otsu                                         | edges-nolines                                       | edges-4side                                         | edges+jev                                            |
| --------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| u1-1280 (7/7 at 2 px, 0 spurious)             | **pass** 100% at 2 px, 0 spurious frames            | **FAIL** 100% at 2 px, 2 spurious frames             | **FAIL** 29% at 2 px, 1 spurious frames            | **pass** 100% at 2 px, 0 spurious frames            | **FAIL** 100% at 2 px, 2 spurious frames            | **FAIL** 100% at 2 px, 2 spurious frames             |
| u1-390 (7/7 at 2 px, 0 spurious)              | **pass** 100% at 2 px, 0 spurious frames            | **FAIL** 100% at 2 px, 1 spurious frames             | **FAIL** 29% at 2 px, 1 spurious frames            | **pass** 100% at 2 px, 0 spurious frames            | **FAIL** 100% at 2 px, 1 spurious frames            | **FAIL** 100% at 2 px, 1 spurious frames             |
| plain-1280 (2/2 at 2 px, 0 spurious)          | **pass** 100% at 2 px, 0 spurious frames            | **pass** 100% at 2 px, 0 spurious frames             | **FAIL** 0% at 2 px, 0 spurious frames             | **pass** 100% at 2 px, 0 spurious frames            | **pass** 100% at 2 px, 0 spurious frames            | **pass** 100% at 2 px, 0 spurious frames             |
| flat-conciv (L1 and L2 >= 90% at 2 px)        | **FAIL** L1 50% / L2 57% at 2 px, 0 spurious frames | **FAIL** L1 42% / L2 57% at 2 px, 40 spurious frames | **FAIL** L1 0% / L2 7% at 2 px, 22 spurious frames | **FAIL** L1 8% / L2 57% at 2 px, 35 spurious frames | **FAIL** L1 17% / L2 57% at 2 px, 2 spurious frames | **FAIL** L1 42% / L2 57% at 2 px, 27 spurious frames |
| shadow-stripe (>= 70% at 4 px, < 3 spurious)  | **FAIL** 14% at 4 px, 1 spurious frames             | **FAIL** 30% at 4 px, 67 spurious frames             | **FAIL** 16% at 4 px, 77 spurious frames           | **FAIL** 24% at 4 px, 62 spurious frames            | **FAIL** 24% at 4 px, 8 spurious frames             | **FAIL** 22% at 4 px, 26 spurious frames             |
| photo-guardian (>= 70% at 4 px, < 3 spurious) | **FAIL** 52% at 4 px, 3 spurious frames             | **FAIL** 71% at 4 px, 33 spurious frames             | **FAIL** 43% at 4 px, 52 spurious frames           | **FAIL** 62% at 4 px, 25 spurious frames            | **FAIL** 48% at 4 px, 2 spurious frames             | **FAIL** 67% at 4 px, 19 spurious frames             |

### Comparison (recall 2 px / recall 4 px / precision 4 px / spurious frames / spurious images)

| variant                | u1-1280                    | u1-390                     | plain-1280                 | flat-conciv               | shadow-stripe             | photo-guardian            | shadow-story            |
| ---------------------- | -------------------------- | -------------------------- | -------------------------- | ------------------------- | ------------------------- | ------------------------- | ----------------------- |
| threshold-rgb-adaptive | 100% / 100% / 100% / 0 / 0 | 100% / 100% / 100% / 0 / 0 | 100% / 100% / 100% / 0 / 0 | 47% / 47% / 94% / 0 / 1   | 14% / 14% / 53% / 1 / 8   | 52% / 52% / 65% / 3 / 3   | 50% / 50% / 67% / 1 / 0 |
| edges                  | 100% / 100% / 80% / 2 / 0  | 100% / 100% / 89% / 1 / 0  | 100% / 100% / 67% / 0 / 1  | 53% / 53% / 23% / 40 / 22 | 27% / 30% / 22% / 67 / 11 | 71% / 71% / 25% / 33 / 15 | 50% / 50% / 40% / 3 / 0 |
| edges-otsu             | 29% / 29% / 67% / 1 / 0    | 29% / 29% / 67% / 1 / 0    | 0% / 0% / 0% / 0 / 1       | 9% / 9% / 6% / 22 / 23    | 16% / 16% / 6% / 77 / 10  | 43% / 43% / 12% / 52 / 28 | 0% / 0% / 100% / 0 / 0  |
| edges-nolines          | 100% / 100% / 100% / 0 / 0 | 100% / 100% / 100% / 0 / 0 | 100% / 100% / 67% / 0 / 1  | 41% / 41% / 21% / 35 / 22 | 24% / 24% / 22% / 62 / 11 | 62% / 62% / 25% / 25 / 15 | 50% / 50% / 50% / 1 / 0 |
| edges-4side            | 100% / 100% / 80% / 2 / 0  | 100% / 100% / 89% / 1 / 0  | 100% / 100% / 67% / 0 / 1  | 44% / 44% / 40% / 2 / 22  | 22% / 24% / 47% / 8 / 11  | 48% / 48% / 37% / 2 / 15  | 0% / 0% / 33% / 2 / 0   |
| edges+jev              | 100% / 100% / 80% / 2 / 0  | 100% / 100% / 89% / 1 / 0  | 100% / 100% / 67% / 0 / 1  | 50% / 50% / 27% / 27 / 22 | 19% / 22% / 34% / 26 / 11 | 67% / 67% / 31% / 19 / 15 | 50% / 50% / 50% / 2 / 0 |

### Time per page (ms, segmentation; edges+jev adds the Jev request wall time to the edges time)

| variant                | u1-1280 | u1-390 | plain-1280 | flat-conciv | shadow-stripe | photo-guardian | shadow-story |
| ---------------------- | ------- | ------ | ---------- | ----------- | ------------- | -------------- | ------------ |
| threshold-rgb-adaptive | 76      | 33     | 54         | 357         | 548           | 1164           | 94           |
| edges                  | 90      | 34     | 55         | 367         | 407           | 485            | 172          |
| edges-otsu             | 83      | 26     | 71         | 283         | 353           | 549            | 180          |
| edges-nolines          | 73      | 27     | 57         | 304         | 394           | 358            | 166          |
| edges-4side            | 90      | 34     | 55         | 367         | 407           | 485            | 172          |
| edges+jev              | 424     | 243    | 314        | 724         | 732           | 722            | 383          |

### Edge map facts per page

| page           | binary threshold fixed / Otsu | candidates after size filter (frames / images) | text edge pixels surviving text removal | Hough lines (H+V, merged) |
| -------------- | ----------------------------- | ---------------------------------------------- | --------------------------------------- | ------------------------- |
| u1-1280        | 4 / 66                        | 10 (10 / 0)                                    | 23%                                     | 44                        |
| u1-390         | 4 / 66                        | 9 (9 / 0)                                      | 23%                                     | 43                        |
| plain-1280     | 4 / 72                        | 3 (2 / 1)                                      | 44%                                     | 19                        |
| flat-conciv    | 4 / 58                        | 81 (59 / 22)                                   | 45%                                     | 446                       |
| shadow-stripe  | 4 / 62                        | 104 (93 / 11)                                  | 87%                                     | 1226                      |
| photo-guardian | 4 / 77                        | 69 (47 / 22)                                   | 64%                                     | 1630                      |
| shadow-story   | 4 / 52                        | 9 (9 / 0)                                      | 45%                                     | 23                        |

### Jev cost and latency

| page           | model      | frame candidates = questions | requests | input / output tokens | wall ms | kept true / dropped true / kept spurious / dropped spurious |
| -------------- | ---------- | ---------------------------- | -------- | --------------------- | ------- | ----------------------------------------------------------- |
| u1-1280        | jev-1.14.0 | 10                           | 1        | 2060 / 174            | 334     | 7 / 0 / 2 / 0                                               |
| u1-390         | jev-1.14.0 | 9                            | 1        | 1878 / 157            | 209     | 7 / 0 / 1 / 0                                               |
| plain-1280     | jev-1.14.0 | 2                            | 1        | 666 / 38              | 259     | 2 / 0 / 0 / 0                                               |
| flat-conciv    | jev-1.14.0 | 59                           | 1        | 10605 / 1061          | 357     | 16 / 1 / 27 / 13                                            |
| shadow-stripe  | jev-1.14.0 | 93                           | 1        | 16583 / 1675          | 325     | 7 / 3 / 29 / 41                                             |
| photo-guardian | jev-1.14.0 | 47                           | 1        | 8544 / 842            | 237     | 9 / 1 / 22 / 14                                             |
| shadow-story   | jev-1.14.0 | 9                            | 1        | 1875 / 157            | 211     | 2 / 0 / 2 / 1                                               |
| total          |            |                              |          | 42211 / 4104          |         |                                                             |

### Jev flips against the truth

#### u1-1280

Spurious candidates Jev kept (2):

| noul | box              | aspect | level | children | text comps | uniformity | border sides          | parent fill dist | source |
| ---- | ---------------- | ------ | ----- | -------- | ---------- | ---------- | --------------------- | ---------------- | ------ |
| 0.66 | 1232x35 @ 24,250 | 35.2   | 2     | 0        | 3          | 0.96       | top,right,bottom,left | 0                | lines  |
| 0.63 | 1232x35 @ 24,319 | 35.2   | 2     | 0        | 3          | 0.97       | top,right,bottom,left | 0                | lines  |

#### u1-390

Spurious candidates Jev kept (1):

| noul | box             | aspect | level | children | text comps | uniformity | border sides          | parent fill dist | source |
| ---- | --------------- | ------ | ----- | -------- | ---------- | ---------- | --------------------- | ---------------- | ------ |
| 0.70 | 342x35 @ 24,250 | 9.77   | 2     | 0        | 3          | 0.86       | top,right,bottom,left | 0                | lines  |

#### flat-conciv

True containers Jev dropped (1):

| noul | box              | aspect | level | children | text comps | uniformity | border sides          | parent fill dist | source       |
| ---- | ---------------- | ------ | ----- | -------- | ---------- | ---------- | --------------------- | ---------------- | ------------ |
| 0.42 | 122x26 @ 689,571 | 4.69   | 9     | 0        | 2          | 0.71       | top,right,bottom,left | 153              | component+xy |

Spurious candidates Jev kept (27, first 25 by noul):

| noul | box                | aspect | level | children | text comps | uniformity | border sides          | parent fill dist | source       |
| ---- | ------------------ | ------ | ----- | -------- | ---------- | ---------- | --------------------- | ---------------- | ------------ |
| 0.84 | 367x175 @ 459,996  | 2.1    | 4     | 1        | 4          | 0.93       | top,bottom,left       | 0                | component+xy |
| 0.82 | 369x175 @ 76,996   | 2.11   | 4     | 1        | 4          | 0.93       | top,right,bottom      | 0                | component+xy |
| 0.81 | 363x181 @ 835,1179 | 2.01   | 4     | 1        | 4          | 0.93       | right,bottom,left     | 0                | component+xy |
| 0.77 | 638x724 @ 621,1591 | 0.88   | 4     | 2        | 23         | 0.69       | top,right,bottom      | 11               | component+xy |
| 0.77 | 537x461 @ 662,164  | 1.16   | 5     | 2        | 15         | 0.82       | top,right,bottom,left | 0                | xy           |
| 0.76 | 367x181 @ 459,1179 | 2.03   | 4     | 1        | 4          | 0.91       | bottom,left           | 0                | component+xy |
| 0.75 | 369x181 @ 76,1179  | 2.04   | 4     | 1        | 4          | 0.93       | right,bottom          | 0                | component+xy |
| 0.74 | 1122x175 @ 76,996  | 6.41   | 3     | 3        | 20         | 0.92       | top,right,bottom      | 6                | xy           |
| 0.73 | 537x332 @ 662,164  | 1.62   | 6     | 0        | 11         | 0.9        | top,right,left        | 0                | lines        |
| 0.71 | 354x492 @ 83,126   | 0.72   | 4     | 4        | 33         | 0.75       | top                   | 0                | xy           |
| 0.70 | 1122x181 @ 76,1179 | 6.2    | 3     | 3        | 20         | 0.91       | right,bottom          | 6                | xy           |
| 0.67 | 44x44 @ 873,569    | 1      | 7     | 1        | 1          | 0          | right,bottom          | 28               | xy           |
| 0.66 | 1279x754 @ 0,1     | 1.7    | 1     | 2        | 90         | 0.75       | bottom                | 0                | lines        |
| 0.66 | 1278x1726 @ 0,673  | 0.74   | 1     | 1        | 724        | 0.79       | top                   | 0                | lines        |
| 0.65 | 1279x673 @ 0,1     | 1.9    | 2     | 4        | 63         | 0.73       | bottom                | 0                | lines        |
| 0.65 | 537x39 @ 662,115   | 13.77  | 5     | 1        | 6          | 0.82       | top,right,left        | 6                | xy           |
| 0.64 | 1116x510 @ 83,115  | 2.19   | 3     | 3        | 54         | 0.82       | right                 | 0                | xy           |
| 0.64 | 1176x724 @ 83,1591 | 1.62   | 3     | 5        | 32         | 0.59       | right                 | 0                | xy           |
| 0.63 | 1278x1645 @ 0,754  | 0.78   | 2     | 8        | 697        | 0.8        | top                   | 0                | lines        |
| 0.63 | 77x73 @ 83,1595    | 1.05   | 4     | 1        | 0          | 0.69       | none                  | 0                | xy           |
| 0.61 | 339x118 @ 85,264   | 2.87   | 5     | 4        | 1          | 0.61       | left                  | 0                | xy           |
| 0.61 | 37x46 @ 278,517    | 0.8    | 6     | 1        | 1          | 0.43       | top,right,bottom      | 0                | xy           |
| 0.59 | 426x42 @ 813,1769  | 10.14  | 5     | 0        | 5          | 0.87       | top,right,bottom,left | 16               | component    |
| 0.57 | 136x42 @ 675,571   | 3.24   | 8     | 1        | 2          | 0.01       | top,bottom,left       | 113              | xy           |
| 0.56 | 552x39 @ 84,1532   | 14.15  | 3     | 2        | 0          | 0.79       | right,left            | 0                | xy           |

#### shadow-stripe

True containers Jev dropped (3):

| noul | box               | aspect | level | children | text comps | uniformity | border sides          | parent fill dist | source       |
| ---- | ----------------- | ------ | ----- | -------- | ---------- | ---------- | --------------------- | ---------------- | ------------ |
| 0.41 | 117x24 @ 362,1567 | 4.88   | 3     | 0        | 1          | 0.87       | top,right,bottom,left | 296              | component    |
| 0.40 | 118x24 @ 485,1567 | 4.92   | 3     | 0        | 1          | 0.91       | top,right,bottom,left | 442              | component    |
| 0.47 | 154x26 @ 108,1721 | 5.92   | 7     | 0        | 1          | 0.95       | top,right,bottom,left | 55               | component+xy |

Spurious candidates Jev kept (29, first 25 by noul):

| noul | box                | aspect | level | children | text comps | uniformity | border sides          | parent fill dist | source       |
| ---- | ------------------ | ------ | ----- | -------- | ---------- | ---------- | --------------------- | ---------------- | ------------ |
| 0.86 | 183x341 @ 95,1426  | 0.54   | 5     | 2        | 8          | 0.87       | top,right,bottom,left | 0                | component    |
| 0.85 | 241x132 @ 362,1651 | 1.83   | 3     | 3        | 9          | 0.95       | top,right,bottom,left | 0                | component    |
| 0.85 | 180x340 @ 95,1426  | 0.53   | 6     | 2        | 8          | 0.87       | top,right,bottom,left | 0                | lines        |
| 0.85 | 202x360 @ 85,1426  | 0.56   | 4     | 1        | 8          | 0.75       | top,right,bottom,left | 0                | xy           |
| 0.84 | 180x342 @ 95,1425  | 0.53   | 4     | 2        | 8          | 0.86       | top,right,bottom,left | 0                | lines        |
| 0.84 | 180x341 @ 95,1426  | 0.53   | 6     | 2        | 8          | 0.87       | top,right,bottom,left | 0                | lines        |
| 0.83 | 180x341 @ 95,1425  | 0.53   | 4     | 2        | 8          | 0.86       | top,right,bottom,left | 0                | lines        |
| 0.80 | 202x391 @ 85,1395  | 0.52   | 3     | 2        | 9          | 0.7        | right,bottom,left     | 0                | component    |
| 0.78 | 241x66 @ 362,1684  | 3.65   | 4     | 0        | 3          | 0.93       | top,right,bottom,left | 0                | lines        |
| 0.74 | 395x329 @ 32,2070  | 1.2    | 3     | 3        | 96         | 0.51       | right,left            | 5                | xy           |
| 0.73 | 395x319 @ 441,2080 | 1.24   | 3     | 4        | 2615       | 0.05       | right,left            | 34               | xy           |
| 0.70 | 153x298 @ 109,1449 | 0.51   | 7     | 0        | 2          | 0.83       | bottom                | 0                | xy           |
| 0.69 | 399x299 @ 849,2100 | 1.33   | 3     | 1        | 102        | 0.9        | right,left            | 1                | xy           |
| 0.67 | 168x319 @ 611,2080 | 0.53   | 4     | 3        | 1121       | 0.01       | none                  | 36               | xy           |
| 0.64 | 261x62 @ 81,2186   | 4.21   | 4     | 0        | 5          | 0.83       | top,right,bottom      | 14               | component    |
| 0.62 | 1262x899 @ 17,76   | 1.4    | 2     | 27       | 3674       | 0.66       | top,bottom,left       | 0                | lines        |
| 0.61 | 368x75 @ 468,1941  | 4.91   | 3     | 3        | 100        | 0.79       | right                 | 30               | xy           |
| 0.61 | 77x53 @ 468,1957   | 1.45   | 4     | 1        | 0          | 0.64       | left                  | 2                | xy           |
| 0.60 | 241x34 @ 362,1651  | 7.09   | 4     | 0        | 3          | 0.96       | top,right,bottom,left | 0                | lines        |
| 0.60 | 241x34 @ 362,1749  | 7.09   | 4     | 0        | 3          | 0.95       | top,right,bottom,left | 0                | lines        |
| 0.57 | 72x74 @ 126,2292   | 0.97   | 5     | 0        | 12         | 0.58       | bottom                | 275              | component+xy |
| 0.57 | 102x311 @ 495,2088 | 0.33   | 4     | 1        | 710        | 0.02       | top                   | 26               | xy           |
| 0.56 | 254x82 @ 876,1957  | 3.1    | 4     | 1        | 0          | 0.68       | none                  | 0                | xy           |
| 0.55 | 228x149 @ 934,1637 | 1.53   | 4     | 0        | 0          | 0.79       | none                  | 0                | component+xy |
| 0.54 | 355x96 @ 876,1943  | 3.7    | 3     | 2        | 1          | 0.78       | none                  | 2                | xy           |

#### photo-guardian

True containers Jev dropped (1):

| noul | box             | aspect | level | children | text comps | uniformity | border sides | parent fill dist | source    |
| ---- | --------------- | ------ | ----- | -------- | ---------- | ---------- | ------------ | ---------------- | --------- |
| 0.49 | 40x40 @ 720,566 | 1      | 5     | 0        | 0          | 0.84       | none         | 256              | component |

Spurious candidates Jev kept (22):

| noul | box                | aspect | level | children | text comps | uniformity | border sides          | parent fill dist | source             |
| ---- | ------------------ | ------ | ----- | -------- | ---------- | ---------- | --------------------- | ---------------- | ------------------ |
| 0.75 | 258x118 @ 890,367  | 2.19   | 8     | 1        | 3          | 0.68       | top,bottom,left       | 0                | component          |
| 0.72 | 220x144 @ 730,1702 | 1.53   | 7     | 1        | 5          | 0.62       | right,left            | 1                | xy                 |
| 0.70 | 1280x359 @ 0,0     | 3.57   | 2     | 2        | 1          | 0.55       | bottom                | 0                | lines              |
| 0.70 | 1280x199 @ 0,294   | 6.43   | 3     | 2        | 19         | 0.3        | top,bottom            | 18               | lines              |
| 0.70 | 1280x198 @ 0,295   | 6.46   | 3     | 3        | 19         | 0.31       | top,bottom            | 18               | lines              |
| 0.69 | 1280x493 @ 0,0     | 2.6    | 1     | 2        | 19         | 0.39       | bottom                | 31               | lines              |
| 0.68 | 970x250 @ 155,24   | 3.88   | 4     | 0        | 0          | 1          | top,right,bottom,left | 0                | component+lines+xy |
| 0.68 | 940x118 @ 250,367  | 7.97   | 6     | 3        | 18         | 0.64       | top,bottom,left       | 6                | xy                 |
| 0.62 | 1280x2104 @ 0,295  | 0.61   | 1     | 3        | 1036       | 0.53       | top                   | 0                | lines              |
| 0.62 | 1280x2040 @ 0,359  | 0.63   | 2     | 2        | 1035       | 0.58       | top                   | 0                | lines              |
| 0.60 | 1276x1828 @ 2,571  | 0.7    | 5     | 23       | 1016       | 0.62       | none                  | 0                | component          |
| 0.60 | 1280x1894 @ 0,505  | 0.68   | 4     | 3        | 1017       | 0.59       | none                  | 0                | xy                 |
| 0.58 | 1280x2105 @ 0,294  | 0.61   | 1     | 2        | 1036       | 0.54       | top                   | 0                | lines              |
| 0.58 | 1280x1906 @ 0,493  | 0.67   | 3     | 1        | 1017       | 0.57       | top                   | 0                | lines              |
| 0.58 | 1139x45 @ 70,619   | 25.31  | 6     | 0        | 13         | 0.88       | top,right,bottom,left | 365              | lines              |
| 0.58 | 228x41 @ 943,295   | 5.56   | 7     | 1        | 0          | 0.8        | top,left              | 0                | xy                 |
| 0.57 | 1280x41 @ 0,295    | 31.22  | 6     | 1        | 1          | 0.96       | top                   | 0                | xy                 |
| 0.56 | 60x41 @ 1111,295   | 1.46   | 8     | 0        | 0          | 0.77       | top,left              | 0                | xy                 |
| 0.55 | 1276x41 @ 2,295    | 31.12  | 6     | 1        | 1          | 0.97       | top                   | 0                | component          |
| 0.55 | 151x42 @ 943,295   | 3.6    | 6     | 0        | 0          | 0.78       | top,left              | 0                | xy                 |
| 0.52 | 108x98 @ 1082,377  | 1.1    | 8     | 1        | 5          | 0.11       | none                  | 42               | component          |
| 0.52 | 157x71 @ 261,379   | 2.21   | 8     | 2        | 0          | 0.74       | none                  | 0                | xy                 |

#### shadow-story

Spurious candidates Jev kept (2):

| noul | box             | aspect | level | children | text comps | uniformity | border sides          | parent fill dist | source    |
| ---- | --------------- | ------ | ----- | -------- | ---------- | ---------- | --------------------- | ---------------- | --------- |
| 0.77 | 568x150 @ 16,16 | 3.79   | 1     | 2        | 5          | 0.58       | top,right,bottom,left | 23               | component |
| 0.63 | 512x37 @ 56,89  | 13.84  | 2     | 1        | 0          | 0.75       | top,right,bottom,left | 19               | lines     |

### u1-1280

| metric                                        | threshold-rgb-adaptive | edges       | edges-otsu  | edges-nolines | edges-4side | edges+jev   |
| --------------------------------------------- | ---------------------- | ----------- | ----------- | ------------- | ----------- | ----------- |
| truth containers                              | 7                      | 7           | 7           | 7             | 7           | 7           |
| found (frames / images)                       | 7 (7 / 0)              | 10 (10 / 0) | 3 (3 / 0)   | 8 (8 / 0)     | 10 (10 / 0) | 10 (10 / 0) |
| recall 2 px / 4 px                            | 100% / 100%            | 100% / 100% | 29% / 29%   | 100% / 100%   | 100% / 100% | 100% / 100% |
| precision 2 px / 4 px                         | 100% / 100%            | 80% / 80%   | 67% / 67%   | 100% / 100%   | 80% / 80%   | 80% / 80%   |
| level 1 recall 2 / 4 px (5)                   | 100% / 100%            | 100% / 100% | 0% / 0%     | 100% / 100%   | 100% / 100% | 100% / 100% |
| level 2 recall 2 / 4 px (2)                   | 100% / 100%            | 100% / 100% | 100% / 100% | 100% / 100%   | 100% / 100% | 100% / 100% |
| nesting depth found / truth / deepest matched | 2 / 2 / 2              | 2 / 2 / 2   | 2 / 2 / 2   | 2 / 2 / 2     | 2 / 2 / 2   | 2 / 2 / 2   |
| spurious frames / images                      | 0 / 0                  | 2 / 0       | 1 / 0       | 0 / 0         | 2 / 0       | 2 / 0       |
| time ms                                       | 76                     | 90          | 83          | 73            | 90          | 91          |

### u1-390

| metric                                        | threshold-rgb-adaptive | edges       | edges-otsu  | edges-nolines | edges-4side | edges+jev   |
| --------------------------------------------- | ---------------------- | ----------- | ----------- | ------------- | ----------- | ----------- |
| truth containers                              | 7                      | 7           | 7           | 7             | 7           | 7           |
| found (frames / images)                       | 7 (7 / 0)              | 9 (9 / 0)   | 3 (3 / 0)   | 8 (8 / 0)     | 9 (9 / 0)   | 9 (9 / 0)   |
| recall 2 px / 4 px                            | 100% / 100%            | 100% / 100% | 29% / 29%   | 100% / 100%   | 100% / 100% | 100% / 100% |
| precision 2 px / 4 px                         | 100% / 100%            | 89% / 89%   | 67% / 67%   | 100% / 100%   | 89% / 89%   | 89% / 89%   |
| level 1 recall 2 / 4 px (5)                   | 100% / 100%            | 100% / 100% | 0% / 0%     | 100% / 100%   | 100% / 100% | 100% / 100% |
| level 2 recall 2 / 4 px (2)                   | 100% / 100%            | 100% / 100% | 100% / 100% | 100% / 100%   | 100% / 100% | 100% / 100% |
| nesting depth found / truth / deepest matched | 2 / 2 / 2              | 2 / 2 / 2   | 2 / 2 / 2   | 2 / 2 / 2     | 2 / 2 / 2   | 2 / 2 / 2   |
| spurious frames / images                      | 0 / 0                  | 1 / 0       | 1 / 0       | 0 / 0         | 1 / 0       | 1 / 0       |
| time ms                                       | 33                     | 34          | 26          | 27            | 34          | 34          |

### plain-1280

| metric                                        | threshold-rgb-adaptive | edges       | edges-otsu | edges-nolines | edges-4side | edges+jev   |
| --------------------------------------------- | ---------------------- | ----------- | ---------- | ------------- | ----------- | ----------- |
| truth containers                              | 2                      | 2           | 2          | 2             | 2           | 2           |
| found (frames / images)                       | 2 (2 / 0)              | 3 (2 / 1)   | 1 (0 / 1)  | 3 (2 / 1)     | 3 (2 / 1)   | 3 (2 / 1)   |
| recall 2 px / 4 px                            | 100% / 100%            | 100% / 100% | 0% / 0%    | 100% / 100%   | 100% / 100% | 100% / 100% |
| precision 2 px / 4 px                         | 100% / 100%            | 67% / 67%   | 0% / 0%    | 67% / 67%     | 67% / 67%   | 67% / 67%   |
| level 1 recall 2 / 4 px (2)                   | 100% / 100%            | 100% / 100% | 0% / 0%    | 100% / 100%   | 100% / 100% | 100% / 100% |
| nesting depth found / truth / deepest matched | 1 / 1 / 1              | 2 / 1 / 1   | 1 / 1 / 0  | 2 / 1 / 1     | 2 / 1 / 1   | 2 / 1 / 1   |
| spurious frames / images                      | 0 / 0                  | 0 / 1       | 0 / 1      | 0 / 1         | 0 / 1       | 0 / 1       |
| time ms                                       | 54                     | 55          | 71         | 57            | 55          | 55          |

### flat-conciv

| metric                                        | threshold-rgb-adaptive | edges        | edges-otsu   | edges-nolines | edges-4side  | edges+jev    |
| --------------------------------------------- | ---------------------- | ------------ | ------------ | ------------- | ------------ | ------------ |
| truth containers                              | 32                     | 32           | 32           | 32            | 32           | 32           |
| found (frames / images)                       | 16 (15 / 1)            | 81 (59 / 22) | 48 (25 / 23) | 72 (50 / 22)  | 40 (18 / 22) | 67 (45 / 22) |
| recall 2 px / 4 px                            | 47% / 47%              | 53% / 53%    | 9% / 9%      | 41% / 41%     | 44% / 44%    | 50% / 50%    |
| precision 2 px / 4 px                         | 94% / 94%              | 23% / 23%    | 6% / 6%      | 21% / 21%     | 40% / 40%    | 27% / 27%    |
| level 1 recall 2 / 4 px (12)                  | 50% / 50%              | 42% / 42%    | 0% / 0%      | 8% / 8%       | 17% / 17%    | 42% / 42%    |
| level 2 recall 2 / 4 px (14)                  | 57% / 57%              | 57% / 57%    | 7% / 7%      | 57% / 57%     | 57% / 57%    | 57% / 57%    |
| level 3 recall 2 / 4 px (4)                   | 25% / 25%              | 75% / 75%    | 0% / 0%      | 75% / 75%     | 75% / 75%    | 75% / 75%    |
| nesting depth found / truth / deepest matched | 2 / 4 / 3              | 9 / 4 / 4    | 5 / 4 / 4    | 7 / 4 / 4     | 4 / 4 / 4    | 8 / 4 / 3    |
| media as image / frame (of total)             | 0 / 0 (2)              | 0 / 0 (2)    | 0 / 0 (2)    | 0 / 0 (2)     | 0 / 0 (2)    | 0 / 0 (2)    |
| gradients as image / frame (of total)         | 0 / 0 (4)              | 0 / 1 (4)    | 0 / 0 (4)    | 0 / 1 (4)     | 0 / 1 (4)    | 0 / 1 (4)    |
| spurious frames / images                      | 0 / 1                  | 40 / 22      | 22 / 23      | 35 / 22       | 2 / 22       | 27 / 22      |
| time ms                                       | 357                    | 367          | 283          | 304           | 367          | 727          |

### shadow-stripe

| metric                                        | threshold-rgb-adaptive | edges         | edges-otsu   | edges-nolines | edges-4side  | edges+jev    |
| --------------------------------------------- | ---------------------- | ------------- | ------------ | ------------- | ------------ | ------------ |
| truth containers                              | 37                     | 37            | 37           | 37            | 37           | 37           |
| found (frames / images)                       | 19 (11 / 8)            | 100 (89 / 11) | 93 (83 / 10) | 93 (82 / 11)  | 36 (25 / 11) | 56 (45 / 11) |
| recall 2 px / 4 px                            | 14% / 14%              | 27% / 30%     | 16% / 16%    | 24% / 24%     | 22% / 24%    | 19% / 22%    |
| precision 2 px / 4 px                         | 53% / 53%              | 21% / 22%     | 6% / 6%      | 22% / 22%     | 44% / 47%    | 32% / 34%    |
| level 1 recall 2 / 4 px (7)                   | 14% / 14%              | 14% / 14%     | 14% / 14%    | 14% / 14%     | 14% / 14%    | 14% / 14%    |
| level 2 recall 2 / 4 px (12)                  | 0% / 0%                | 25% / 25%     | 25% / 25%    | 17% / 17%     | 25% / 25%    | 25% / 25%    |
| level 3 recall 2 / 4 px (6)                   | 0% / 0%                | 33% / 50%     | 0% / 0%      | 33% / 33%     | 0% / 17%     | 33% / 50%    |
| nesting depth found / truth / deepest matched | 2 / 5 / 4              | 6 / 5 / 5     | 5 / 5 / 4    | 6 / 5 / 5     | 3 / 5 / 5    | 5 / 5 / 5    |
| media as image / frame (of total)             | 0 / 0 (9)              | 0 / 0 (9)     | 0 / 0 (9)    | 0 / 0 (9)     | 0 / 0 (9)    | 0 / 0 (9)    |
| gradients as image / frame (of total)         | 3 / 0 (9)              | 0 / 5 (9)     | 0 / 0 (9)    | 0 / 5 (9)     | 0 / 2 (9)    | 0 / 5 (9)    |
| spurious frames / images                      | 1 / 8                  | 67 / 11       | 77 / 10      | 62 / 11       | 8 / 11       | 26 / 11      |
| time ms                                       | 548                    | 407           | 353          | 394           | 407          | 737          |

### photo-guardian

| metric                                        | threshold-rgb-adaptive | edges        | edges-otsu   | edges-nolines | edges-4side | edges+jev    |
| --------------------------------------------- | ---------------------- | ------------ | ------------ | ------------- | ----------- | ------------ |
| truth containers                              | 21                     | 21           | 21           | 21            | 21          | 21           |
| found (frames / images)                       | 17 (6 / 11)            | 64 (43 / 21) | 91 (63 / 28) | 53 (32 / 21)  | 27 (6 / 21) | 49 (28 / 21) |
| recall 2 px / 4 px                            | 52% / 52%              | 71% / 71%    | 43% / 43%    | 62% / 62%     | 48% / 48%   | 67% / 67%    |
| precision 2 px / 4 px                         | 65% / 65%              | 25% / 25%    | 12% / 12%    | 25% / 25%     | 37% / 37%   | 31% / 31%    |
| level 1 recall 2 / 4 px (14)                  | 64% / 64%              | 86% / 86%    | 50% / 50%    | 71% / 71%     | 57% / 57%   | 86% / 86%    |
| level 2 recall 2 / 4 px (6)                   | 33% / 33%              | 50% / 50%    | 17% / 17%    | 50% / 50%     | 33% / 33%   | 33% / 33%    |
| level 3 recall 2 / 4 px (1)                   | 0% / 0%                | 0% / 0%      | 100% / 100%  | 0% / 0%       | 0% / 0%     | 0% / 0%      |
| nesting depth found / truth / deepest matched | 2 / 3 / 2              | 8 / 3 / 2    | 8 / 3 / 3    | 5 / 3 / 2     | 2 / 3 / 2   | 8 / 3 / 2    |
| media as image / frame (of total)             | 8 / 1 (10)             | 6 / 3 (10)   | 0 / 4 (10)   | 6 / 3 (10)    | 6 / 2 (10)  | 6 / 3 (10)   |
| gradients as image / frame (of total)         | 0 / 0 (2)              | 0 / 0 (2)    | 0 / 0 (2)    | 0 / 0 (2)     | 0 / 0 (2)   | 0 / 0 (2)    |
| spurious frames / images                      | 3 / 3                  | 33 / 15      | 52 / 28      | 25 / 15       | 2 / 15      | 19 / 15      |
| time ms                                       | 1164                   | 485          | 549          | 358           | 485         | 725          |

### shadow-story

| metric                                        | threshold-rgb-adaptive | edges       | edges-otsu  | edges-nolines | edges-4side | edges+jev   |
| --------------------------------------------- | ---------------------- | ----------- | ----------- | ------------- | ----------- | ----------- |
| truth containers                              | 2                      | 2           | 2           | 2             | 2           | 2           |
| found (frames / images)                       | 3 (3 / 0)              | 5 (5 / 0)   | 1 (1 / 0)   | 2 (2 / 0)     | 3 (3 / 0)   | 4 (4 / 0)   |
| recall 2 px / 4 px                            | 50% / 50%              | 50% / 50%   | 0% / 0%     | 50% / 50%     | 0% / 0%     | 50% / 50%   |
| precision 2 px / 4 px                         | 67% / 67%              | 40% / 40%   | 100% / 100% | 50% / 50%     | 33% / 33%   | 50% / 50%   |
| level 1 recall 2 / 4 px (1)                   | 0% / 0%                | 0% / 0%     | 0% / 0%     | 0% / 0%       | 0% / 0%     | 0% / 0%     |
| level 2 recall 2 / 4 px (1)                   | 100% / 100%            | 100% / 100% | 0% / 0%     | 100% / 100%   | 0% / 0%     | 100% / 100% |
| nesting depth found / truth / deepest matched | 3 / 2 / 2              | 3 / 2 / 2   | 1 / 2 / 0   | 2 / 2 / 2     | 2 / 2 / 0   | 3 / 2 / 2   |
| media as image / frame (of total)             | 0 / 0 (0)              | 0 / 0 (0)   | 0 / 0 (0)   | 0 / 0 (0)     | 0 / 0 (0)   | 0 / 0 (0)   |
| gradients as image / frame (of total)         | 0 / 0 (0)              | 0 / 0 (0)   | 0 / 0 (0)   | 0 / 0 (0)     | 0 / 0 (0)   | 0 / 0 (0)   |
| spurious frames / images                      | 1 / 0                  | 3 / 0       | 0 / 0       | 1 / 0         | 2 / 0       | 2 / 0       |
| time ms                                       | 94                     | 172         | 180         | 166           | 172         | 173         |
