# Pairing and mirror-carry spikes

Throwaway spike code behind rulings 14, 17 and 19 of `docs/designs/design-driver-rulings.md`. It is kept as a record, not
built, linted or tested: the files import from absolute scratchpad paths and need the `raw/` data, which is not committed.
Every image measured was a browser render on macOS.

## pair-spike (ruling 17, pairing; ruling 19, twins)

| File             | What it measured                                                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stages.ts`      | Renders each development stage of a page (finished, placeholder copy, all-block layout, bigger fonts and padding, empty page) with Playwright and collects the DOM nodes, styles, glyph line rects, component hints and accessibility role. |
| `design.ts`      | Reads the finished stage's PNG as a design: tiled OCR text runs and threshold-segmented frames.                                                                                                                                           |
| `pair.ts`        | The calibrated vote: voters, self-calibration, per-kind exclusion, wrapper collapse, gates, margin, dominance and floor; scores each stage as right, wrong, ambiguous or abstained against the DOM truth.                                 |
| `debug.ts`       | Lists the ambiguous, abstained and wrong nodes of one stage.                                                                                                                                                                              |
| `pair-design.ts` | Design-to-design twins on conciv.dev slices, voters minus geometry: 1280 to 780 64 of 66, 780 to 1280 65 of 70, 400 to 780 47 of 56, all with 0 wrong.                                                                                    |
| `pair-site.ts`   | The twin voter inside design-to-DOM pairing at 400: no change on a finished layout (50/5, 52/6), helps on a shifted layout with real copy (38/13 to 42/10), hurts when copy and layout both differ (23/26 to 20/26).                     |
| `results.md`     | The stage table of an early pairer run on stripe.com.                                                                                                                                                                                     |

Final pairer, same code on every page (right, wrong, ambiguous, abstained):

| page                | stage                    | nodes | right | wrong | ambiguous | abstained |
| ------------------- | ------------------------ | ----- | ----- | ----- | --------- | --------- |
| reference dashboard | finished                 | 136   | 136   | 0     | 0         | 0         |
| reference dashboard | placeholder copy         | 136   | 136   | 0     | 0         | 0         |
| reference dashboard | all-block layout         | 136   | 88    | 2     | 17        | 29        |
| reference dashboard | bigger fonts and padding | 136   | 97    | 2     | 11        | 26        |
| reference dashboard | empty page               | 136   | 3     | 0     | 0         | 133       |
| stripe.com          | finished                 | 399   | 349   | 5     | 27        | 18        |
| stripe.com          | placeholder copy         | 399   | 196   | 21    | 34        | 148       |
| MDN `flex`          | finished                 | 621   | 567   | 3     | 12        | 39        |
| MDN `flex`          | placeholder copy         | 621   | 532   | 4     | 17        | 68        |

Timing: Stripe about 3 min for 427 nodes against 1549 elements, MDN 50 s for 645 against 6242.

## interp-spike (ruling 14, mirror carry)

| File                | What it measured                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collect.ts`        | Element boxes, padding, text style and line rects of a page at 57 widths (320 to 1440 in 20 px steps), the ground truth for every prediction.                                            |
| `interp.ts`         | Linear interpolation of boxes between breakpoint widths, the first fallback.                                                                                                             |
| `interp2.ts`        | Interpolation plus text wrap through `measureText` and flow, and mirror carry: design box at d plus (mirror box at W minus mirror box at d).                                              |
| `media-queries.ts`  | The width media queries and container rules each page's stylesheets declare, the CSS steps fallback.                                                                                     |
| `debug-outliers.ts` | The carried text boxes that missed OCR of the real screenshot at 440, 600 and 900; the remaining outliers are OCR run splitting.                                                         |
| `serve-fixture.ts`  | Serves the reference dashboard with Vite for the collectors.                                                                                                                             |

Result: conciv.dev screenshots at 400, 780 and 1280 as designs; a node's box at W predicted by carry matched OCR of the real
screenshot at W with p95 0 to 9 px at 440, 900 and 1400.
