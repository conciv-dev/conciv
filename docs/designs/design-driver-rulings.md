# Design driver: rulings from Omri, 2026-11-01 afternoon

For the design-driver.md rewrite. Each is decided unless marked open.

1. No CDP, no playwright-core. Everything runs in the user's browser. Logged-in session comes for free.
2. Width belongs to the target image (PNG header), never to the user's tab, never a tool argument. Route is metadata, never a lookup key. `design_target` takes an image; `design_diff` takes nothing and uses the session's current target. 2x exports: default 1x, user may state the scale.
3. Live page is never rendered twice. The frame, when used, is a scriptless same-origin document filled by an rrweb mirror of the live DOM, kept current by mutations. It lives in the x-ray tab (visible, so Region Capture works), not in the app tab. App tab carries only the recorder and the x-ray link.
4. Pixels in-browser: Screen Capture `preferCurrentTab` + Region Capture `CropTarget` on the frame (Chromium); snapdom fallback elsewhere. Pixel diff, segmentation, OCR in a worker (wasm).
5. Width-invariant deltas (text, ink color, fill, radius, font size, line height, vertical gaps, heights, padding) compare at the live width with no frame. Width-dependent geometry (x, widths, columns, wraps) goes through a layout engine at the target width (takumi spike pending) and, when the page uses CSS outside its subset, the frame. Constraint inference from the image (anchored/stretch/centered) only as a hint; breakpoints are not inferable from one image.
6. Align hierarchically: global offset/scale, then per container the residual shift of its children; a delta lands on the highest node that explains it. Rows ordered top-down by containment so one fix at the top removes downstream rows on the next round.
7. Every round captures pixels (Run diff and `design_diff` included). A geometry-only round never shows "off" from stale pixels.
8. Several engines, one rule: each measurement carries engine + confidence; precedence per property (DOM rects at live width > frame > takumi); a disagreement beyond tolerance is its own row, never blended. Weighting lives only in row ranking (impact = confidence x delta size x containment depth), the decision-engine slot (rules now, Jev later). Tuned weights only once rounds produce data.
9. Agent discovery: when a target exists, the agent's context states it concretely ("A design target is registered. Call design_diff…"); screenshot tool description points to design_diff for design matching. The sonnet run on 2026-11-01 never found design_diff without this.
10. Geometry sweep across breakpoints (media queries from stylesheets + search for rect jumps) for self-consistency checks (overflow, overlap, clipped text) where no target exists.
11. Border is missing as a delta kind (table row borders showed as "paint differs, no property").
12. Diff image must apply the agreeing-text mask, same as the score.

Open: takumi drift numbers (spike running); Region Capture permission UX; D1–D8 from egm-review/driver-r2 consolidated report still need Omri's call where not superseded above (D1 rounds on HMR: superseded by 7; D2 auto pairs per round: yes; D6 target_elements: superseded by 2/5).

## Spike results and engines added (evening)

- takumi spike (`scratchpad/takumi-spike/results.md`): fixture 0 px (except col/colgroup 0x0); dashboard 170/170, 1280 p95 1.7 px, 390 p95 7.4 px (SF Pro shaping drift); conciv.dev raw 61% matched p95 89 px, with clamp/min/max pre-resolution + opacity/visibility override 97% matched, median 0, p95 25 px. Media queries incl. range syntax correct. Unsupported: clamp/min/max, container queries, opsz. Timing fixture/dashboard/site: takumi 1.5/7/81 ms vs Chromium relayout 0.5/0.7/14 ms (Chromium number excludes frame creation/load/settle). wasm 4.0 MiB + paint 2.8 MiB; native and wasm boxes identical. Fonts must be passed as bytes; system fonts read from /System/Library/Fonts worked; site's 34 woff2 worked. Geometry only from takumi-paint (element identity).
- pretext (chenglou/pretext 1.0.0): browser-only text measurement via canvas measureText, lines + height for text at a width, ~0.5% paragraphs wrong vs Chrome, 40 KB. Role: exact text widths/wrap at target width (fixes takumi's shaping drift, text-driven heights), and a no-layout wrap/clip sweep across widths.
- Engine table: DOM rects (live width) > frame (pixels, pages outside takumi subset) > takumi (boxes at target width) with pretext (text widths); Paddle OCR (target text); blazediff/segmentation (pixels). Each measurement tagged engine + confidence; disagreement beyond tolerance is a row.
- Spike-fix commits on design-loop-spike: 924a407f5 (targets = image + id, design_diff no-arg uses session current), 16d611003 (agent guide text: system prompt, tool results `next`, catalog summaries, screenshot hint), e2fd99425 (scripts/reference dashboard, `loop.ts --reference`). Leftover: assertLiveRoute still refuses when a recorded route differs from the tab; tests at design.it.test.ts lines listed by the agent depend on route/width lookup and replacement.

13. X-ray is an overlay pane in the app tab (conciv widget), not a separate tab. Worker from the app tab does the heavy work; the mirror frame is the overlay's design panel (scriptless, rrweb-filled); Region Capture needs it on screen at 1:1, otherwise snapdom; row click highlights the element on the real page.

## Width rulings (night, interp-spike)

14. Breakpoint designs, mirror carry. Each design image is its own target at its own width d. The live page is never resized by the user. Expected box of a design node at the tab width W = design box at d + (mirror box at W − mirror box at d), where the mirror is the scriptless rrweb-filled frame laid out at d and at W. Therefore the delta list at W equals mirror(d) − design(d): comparison runs at d inside the mirror, the overlay shows carried boxes on the user's tab at W. Text runs carry by whole-line rects (inline children included); a paragraph whose line count changes between d and W carries as the mirror's lines at W plus the design's offset at d. Between designs only self-consistency (overflow, overlap, clip). Measured on conciv.dev screenshots as designs (400/780/1280): carried text vs OCR of the real screenshot at W, p95 0–9 px at 440/900/1400; remaining outliers are OCR run splitting. Spikes 1–3 (lerp, text wrap via measureText + flow, CSS steps from stylesheets) are the fallback for unpaired nodes or a target without a live page, approximate and labelled.
15. Budget: rounds still run on saves for fresh pixels (ruling 7), but round count, budget, demotion and stall/oscillation history advance only on `design_diff` calls.
16. Keep every signal (DOM, mirror, takumi), tag confidence, show disagreement; when widths differ every property comes from target-width signals.

## 17. Pairing is a calibrated vote with per-kind exclusion (pair-spike, 2026-11-01)

Design node to DOM node pairing runs once at the design width. Each candidate pair is scored by independent voters, each returning a score in 0..1 or abstaining: text (OCR run vs element text, Dice with Levenshtein for short strings), kind (tag and a11y role vs heading/label/body/control/cell/container/media), structure (under the paired parent, plus sibling order), style (background colour for frames, font size for text), geometry (page distance plus local distance), pixel (8x8 average hash of the design crop vs the live crop), source (React component name, list key, class names, role, aria-label and matched CSS selectors as kind hints), a11y (computed accessibility role as a kind vote).

In the spike the computed role comes from the Chrome DevTools Protocol accessibility tree, because headless Chromium does not expose it to page scripts. In a live tab without CDP the a11y voter falls back to tag, `role` and `aria-*` attributes, which give the same role for nearly every element here. Weights are renormalised over the voters that apply.

Rules that moved the finished page from 86 right / 37 ambiguous / 16 abstained to 136 / 0 / 0 with 0 wrong, out of 136 nodes:

- Global greedy one-to-one assignment, most confident node first, so repeated texts (invoice ids, dates, statuses) resolve by exclusion.
- Exclusion is per kind: a design frame and a design text run may share one DOM element (a badge span, a button, the active nav link).
- A wrapper with a single child of the same text or the same box collapses to the child, in candidates and in truth.
- Frames must overlap the design box (IoU at least 0.3, area within 3x). Dropping this gate when geometry is untrusted raised wrong pairs on the layout and sizes stages from 4 and 5 to 11 and 18, so the gate stays. A wrong pair costs more than an abstention.
- Self-calibration without labels: before assignment, each voter's weight is scaled by how often its own top choice agrees with the consensus top choice. On sample data the text voter fell to 0.16, on the all-block layout stage geometry fell to 0.10. Same code for every stage.
- Dominance: a small margin is accepted when no voter prefers the runner-up.
- Floor is relative (top under 0.3, or under 1.3 times the median candidate), not an absolute number on a renormalised scale.

Stage results (136 nodes, pairer as of the Stripe and MDN rules): final 136 right / 0 wrong / 0 ambiguous / 0 abstained; sample data 134 / 0 / 2 / 0; layout 86 / 2 / 19 / 29; sizes 94 / 1 / 15 / 26; empty page abstains on 132 (correct). Ambiguity left on sample data is nav links and the first table row, where text is gone and rows look alike.

Real pages (same pairer, scorer counts an ancestor or descendant covering the same ink as the same answer). stripe.com at 1280, 399 design nodes with a DOM truth: 344 right / 5 wrong / 45 ambiguous / 5 abstained on the finished page; with placeholder copy 139 / 32 / 218 / 10 (was 71 wrong before dominance also required a clear win of at least 0.15 on a trusted voter, and before text geometry measured to the nearest rendered line instead of the element's whole ink). Three rules came from Stripe and none is Stripe-specific: a wrapped paragraph is one element and many OCR lines, so a text element takes as many design lines as it has rendered lines; OCR reads logo wordmarks and icon glyphs as text, so a text run may pair with an `svg` or `img` that contains it, with a text vote of one minus its best word match; the greedy loop caches candidate scores and invalidates only descendants of a newly paired frame (3 minutes for 427 × 1549). Of the 5 wrong, 3 are truth errors. The placeholder-copy row says the pairer must refuse more when the text voter is untrusted on dense text.

MDN (`developer.mozilla.org/en-US/docs/Web/CSS/flex` at 1280, 645 design nodes, 6242 DOM nodes) added one capture category and one pairing rule. Capture: the DOM snapshot must walk shadow roots; MDN's code blocks, theme and language switchers live in custom elements, and without them 224 design nodes had no element to pair with (truth count 397 of 645 before, 621 after). Shadow children get an `s`-prefixed path segment so tree rules still work. Pairing: a text candidate's nearest rendered line must cover the OCR box; otherwise one token span inside a code line claims the whole line. Scoring across all pages: an OCR box often includes an adjacent icon, so "same ink" is 60 % coverage, not 80 %. Performance: children and redundant wrappers are computed once per stage; MDN pairs in 50 seconds instead of never finishing.

Final state of the spike pairer, same code on every page:

| page       | stage                    | nodes with truth | right | wrong | ambiguous | abstained           |
| ---------- | ------------------------ | ---------------- | ----- | ----- | --------- | ------------------- |
| dashboard  | finished                 | 136              | 136   | 0     | 0         | 0                   |
| dashboard  | placeholder copy         | 136              | 136   | 0     | 0         | 0                   |
| dashboard  | all-block layout         | 136              | 88    | 2     | 17        | 29                  |
| dashboard  | bigger fonts and padding | 136              | 97    | 2     | 11        | 26                  |
| dashboard  | empty page               | 136              | 3     | 0     | 0         | 132 (nodes missing) |
| stripe.com | finished                 | 399              | 349   | 5     | 27        | 18                  |
| stripe.com | placeholder copy         | 399              | 196   | 21    | 34        | 148                 |
| MDN flex   | finished                 | 621              | 567   | 3     | 12        | 39                  |
| MDN flex   | placeholder copy         | 621              | 532   | 4     | 17        | 64                  |

Two containment rules closed the last gap and are the rule for wrapped text in general: a text element stays open to any OCR line that lies inside its box (capacity is not a line count, because placeholder copy wraps differently from the design), and when geometry is trusted (calibrated scale at least 0.6) a text candidate must contain the OCR line, which stops a token span from claiming a code line. Gates must be off during the calibration pass or they teach the voters false confidence.

Jev or a learned linear layer replaces the hand weights in the same slot; the voters and the assignment stay.

## 18. Everything runs in the user's browser tab, from the widget script (2026-11-01)

No browser extension, no DevTools Protocol, no launched browser in the product. The selling point is that the design driver works inside the page the user already has open. Every signal must come from what a page script can read: DOM, CSSOM and matched rules, the React DevTools hook (component name, key, props), `matchMedia`, ResizeObserver, `role` and `aria-*` attributes, and the mirror for layout at other widths. The computed accessibility role is spike-only; the product derives role from tag and attributes. CDP viewport emulation (plan item 3) is for the test runner only.

## 19. Two universes, width as the axis (2026-11-01)

The mental model for the driver. The design universe has one slice per design width, sparse. Nodes in a slice come from OCR and segmentation. The site universe has one slice per width, continuous, produced by the mirror; node identity across its slices is the DOM element. The pairing links the two universes once per design slice at that slice's width. Design slices are also paired with each other, same voters minus geometry, since reflow moves everything but text, fill, kind and tree position stay. This design-to-design identity does two jobs: a twin voter in the design-to-DOM pairing, and the responsive spec on an empty page, where nothing pairs to DOM yet but the slices already say which nodes disappear, reorder or stretch between widths. When both links exist they must agree; disagreement is shown, not resolved silently (ruling 16). Widths between design slices are predicted from the mirror (ruling 14). The heat map is the matrix node × width of deltas between design and predicted site, with the confidence of each delta carried along (ruling 16).

Twin voter benefit (`pair-spike/pair-site.ts`, conciv.dev 400 design to 400 DOM, hints from 1280 and 780 weighted by their own pair confidence, bonus only): with the finished layout, real or placeholder copy, the twin voter changes nothing (50/5 and 52/6 right/wrong with or without it). With the layout shifted and real copy it helps: 38/13 direct, 42/10 with twins. With placeholder copy and shifted layout every mode is bad (23/26 direct, 20/26 with twins) because the source slices pair badly too and pass their errors on. So the twin voter stays, gated on the source pair's confidence, and the primary signal is still the direct voters. The 23/26 row also says the pairer must refuse more when both text and geometry are untrusted.

Design-to-design spike (`pair-spike/pair-design.ts`, conciv.dev slices, truth = same DOM element at both widths, text voter plus kind, structure under the paired ancestor, relative order, style, pixel; no geometry): 1280 to 780 pairs 64 of 66 twins with 0 wrong; 780 to 1280 65 of 70, 0 wrong; 400 to 780 47 of 56, 0 wrong. Pairs that involve the 400 slice carry 1 to 4 wrong, all from OCR garbage runs at 400 (`wgnnrtc.`, `man1-0 amcdw/dl D`): an OCR confidence floor on design runs removes them. A wrapped paragraph is one DOM element and several OCR lines, so twins are judged per element, not per line.

## 20. Work runs where its data already is (2026-11-01)

Ruling 4 is relaxed: the tab worker is not required. Whatever the tab must do (rects, styles, the mirror, capture, type estimation) runs in the tab; whatever the server process can do with data it already holds (OCR, segmentation, pixel diff on the image file and the transferred raster) runs in the server process. A worker is used only when a step needs the browser and would block the page.

## 21. The mirror is rebuilt per run from a snapshot (2026-11-02)

Ruling 3's "kept current by mutations" meant freshness, not mechanism. The mirror is an `rrweb-snapshot` of the live document rebuilt into the sandboxed iframe at every run. No continuous recording, no `rrweb` dependency, no Replayer.

## 22. Pairing floor (2026-11-02)

Ruling 17's "1.3 times the median" is amended to the spike's final code: a node abstains when its top score is under 0.3 or under the median candidate score plus 0.1.

23. The design dictates a layout. Width, height, x and y are metadata on a layout node, never the ask. The target model carries a layout pass (direction, gap, align, wrap, per-child size fill|fit|fixed, padding) and every brief sentence, row and delta speaks in those terms; a px number reaches the brief only inside a geometry delta on a paired element. A builder that copies coordinates (absolute positioning, px widths) is reported as `painted` and asked for the rule, not the pixel. Stated by Omri repeatedly; written 2026-11-02 after the stripe run painted the page.

24. Text containment in the pairer tests the centre of the OCR line, not the whole box: a text element takes an OCR line whose centre lies inside the element box plus `tileMargin`, and the test applies to every claim, the first included. The whole-box test of ruling 21 rejected a line 1 px above its element and a line straddling two elements, and skipped the first claimant, so the result depended on take order. Found on the rebuilt stripe page, 2026-11-03.

25. The loop clock is the save. A run after an edit re-pairs and recompares only what the edit touched: pairs carry across runs keyed by the design node hash and a live fingerprint (source location, tag, text hash, box) and re-enter the pairer only under files the HMR touched; the pixel compare is cached per 64 px tile by capture hash. Alternative K (no persistent pairs) is reversed: on a real page re-pairing from nothing is the cost, not the moved component. A carry never changes the answer, only the time; with no HMR between runs nothing carries. Target under 2 s after a one-file edit on the stripe page. Omri, 2026-11-03.

26. The target keeps a ledger, one row per design node, across runs: status (`unbuilt | paired | done | regressed | accepted`), the last known live pairing with its fingerprint, and the node's worst item. A run reports its changes against the ledger (`done`, `regressed`, `paired`, `lost`, `moved`), not against the previous round, and a node once paired keeps its element until the element is gone from the page. The agent is told which nodes its edit changed and sees each one as a crop, never only a whole-page diff. (2026-11-03)

27. **Icons are not text.** An OCR line that is not a word of the design's script (a lone CJK glyph in a Latin design, a single character under 24 px, a low-confidence one- or two-character read) is an icon the model stores as an image node, and a small plain box with nothing inside is an icon slot. Icon slots are in the outline for the agent to fill at will, count in the report, and never produce a brief item, score weight or a hold on the stage. Fifth stripe run: 16 of 178 text nodes were icon reads and kept the stage at structure for six rounds.

28. **Sections are a view, not a run.** A section is a top-level box of the design tree. `design_diff({section})` runs the whole page as always and returns only that section's items, changes and counts, so several agents can build sections in parallel against one target. Pairing, carry and ledger stay whole-page. Splitting the work across agents and writing the page skeleton first is the harness's business.

29. **A source line is an address, not an identity.** The compiler that stamps `data-conciv-source` on every JSX element stamps `data-conciv-key` too: a hash of the file, enclosing component, element name, static class and static text, with an ordinal for duplicates. The carry and the ledger match elements by key, text and box; the line is for reading the site and is refreshed every run. Seventh stripe run: a line insertion read as 80 lost and 35 regressed with 61 of the lost nodes paired in that run.

30. **A stall is a stage total that did not move.** The agent edited and the current stage's total held for two rounds; items it is not working on are not a stall. Confusable punctuation (`›` and `>`, dashes, curly quotes, a lone chevron) is the same text. Seventh stripe run stopped `stalled` while the total fell 138 → 121, on `Contact sales ›` against the OCR's `>`.

31. **Never draw a picture from an image.** With an image adapter, icons, logos and illustrations are placeholders: the tool writes the `Placeholder` component next to the outline, the outline marks every picture slot, a drawn `<svg>` or data url raises `svg-drawn`, and picture boxes are masked in the compare. Gradients are paint: two ends and an axis, written as CSS. A Figma adapter will hand over the real assets later.

32. **A return to the best total is a reversal, not a new best.** Item 72's "lowest total never stops" protects an agent that is improving, so a new best must beat the old one by more than the stage tolerance. Down, back, down (A B A B) is two reversals and stops `oscillating` at the fourth round, on the worse side. The step 15 glyph split exposed this: a 0.87 dip under the best hid a reversal. The IT case "a third reversal stops" is amended to stop at the second.
33. **A direction verdict names the container.** The `axis` delta compares a container's measured direction to the design's layout direction; a leaf never carries one, because no edit to a leaf changes where its neighbour sits. Ninth stripe run: five `span`/`strong` axis rows the agent could not clear held the structure stage for the whole run.
34. **The brief never hides the next stage.** Two top rows of the next stage follow the current stage's rows, so a structure item the agent cannot act on does not deadlock the run.
35. **A section is a region.** The top level of the outline is cut by whitespace until a section is something a person would name: the nav, the hero, a card row. Ninth stripe run: 208 sections on a page with eight boxes.
