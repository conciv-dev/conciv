# egm-comprehension review: `docs/designs/design-driver.md` (revision 4)

## What this proposes

The design extension's compare tools become a loop an agent follows end to end. `design_target` takes an image and an optional scale; width comes from the file. `design_diff` and `design_status` act on the session's current target. All measuring happens in the app tab; when the tab width differs, a scriptless copy of the page (the mirror) is laid out at the design width and measured there. The server reads a flat list of text, box and image nodes from the PNG and, every run, matches them to live elements with a weighted vote, then sorts differences into structure, content, geometry and paint. Each report gives a brief of up to 5 items and a stop reason. Rounds count only on `design_diff`. Pins, marks, tolerances and acceptance are saved per target; the x-ray becomes an overlay in the app tab.

## How the existing system works, per this document

`design_target` registers an image keyed by route and width; `design_diff` takes a width and renders the app a second time in a hidden iframe that stalls when covered. Pairing is by exact text equality. The image side carries sampled colors and OCR text, so only text, background, foreground, geometry and unmatched regions fire; no border kind. Pixels are captured on some runs only. One agent-guide bullet; nothing tells the agent a target exists. Slots with registries picked by `pickRuntime`; a file store.

Both paraphrases came easily. Verdict: no Blocker.

## Is the Terms table enough?

No. Missing: session (used from 53, defined at 206), stage/brief/stop reason/score/item (used from 39, defined at 240–262), decision/pin/mark/accept (29, 39, 62 vs 276; accepting a run is `acceptedRun`, not a decision), carry (39, 104, 152, 272), twin (168 before 231), voter/gate/trusted voter/calibrated scale (231), slot (66, 128), design extension, engine route (280, 361), empty page (96 vs 58, 233, 246, 251), capture path, live roles (63 vs 218), TypeSafe, tile gate (114, 251; absent from items 35, 19). Conflicts: mirror defined at the design width (20) but used at 1392 and W (104, 152, 22); site slice defined and unused; text run vs run vs OCR line vs text node mixed (216, 231); round does not say whether the registration run counts; design slice "one per width" vs "every target for a route" (272), two targets at one width undefined.

## Majors

1. **CUJ 6 contradicts the current-target rule (120–122 vs 210).** Registering 1280 then 390 makes 390 current, yet the report lists the 1280 slice.
2. **"Switches targets by name" but no tool takes a target (122 vs 53, 210).** Only the overlay chip switches (404); `findTarget` by id (418) and clear by id (396) hint at an argument the feature section never names.
3. **"Route is a label" but routes group slices (53, 74 vs 120, 272).** With `route` omitted, grouping is undefined.
4. **`sample-data` warnings can block `done` (251 with 257, 400).** The base fixture always has three warned cells, so the content count is never zero and the brief is empty.
5. **`stalled` conflicts with demotion (251 vs 257–261, 460).** A demoted sole item leaves every count zero, so `done` fires where 460 expects `stalled`; no precedence among stops; `oscillating` is also true of an unchanged item; whether the registration run is round 0 or 1 is unstated.
6. **Typography on an empty page (236 vs CUJ 2).** First run pairs nothing, so every estimate uses the body font and is never redone. "Body font stack" undefined.
7. **Does the mirror exist when widths match? (227 vs 236).** Typography renders "in the mirror" on every first run; inserting test text into a Replayer-synced iframe is unexplained.
8. **No way to detect an empty page (96).** "Shared layout" vs page content undefined.
9. **Tab binding (206).** "The tab that registered the target answers", but registration is an MCP call, not a tab action; two tabs on the route is the unresolved case.
10. **Pairing parameters partly unspecified (84, 231, item 29).** Hand weights not given; "trusted voter", "median of what", which gates are off during calibration undefined; item 29 does not say to port the spike.
11. **Plan order (item 21 vs 22, 33).** Item 21 asserts a typography estimate before the mirror (22) and runs (33) exist; the `roles` test would pass for the wrong reason under today's matcher.
12. **`design_winner` keeps a width argument (393, 415, 397 vs Alt D).** Winner, capture and clear tools never described in lines 1–382.
13. **Missing role case (268).** Live literal vs target `data` with different strings (Problem 6's own case); literal vs `placeholder` with different strings tells the agent to type "[Customer Name]".
14. **Rulings cited without content (4, 31, 132, 337, 377):** rulings 4, 10, 12.

## Nits

15. Run triggers (60 vs 225 vs 91). 16. "Only pins, marks and acceptance persist" (39) vs tolerances (62, 276). 17. `disagreement` as row vs field (56, 447, 465). 18. pretext spiked and added, never used. 19. snapdom, ppu, blazediff, Region Capture undefined; 370 omits them. 20. Undefined: agreeing-text mask (132), tile comparator (204), `groupText`/`sideFrom` (337), page client, page extension, `u1`. 21. Path bases inconsistent (172 vs plan vs 385). 22. `inset-*`, `gap-*`, `padding`, `align` never listed; `offset` an item but not a delta kind; `color` (233) vs `foreground` (249). 23. Mirror height "the live page's document height" changes at another width (228). 24. Takumi p95 to confidence mapping not given (229). 25. Target id: short vs content-derived (210, 212, 276). 26. Item 42 pins to a toolbar component on `empty`, which renders none. 27. "Widths match": exact or tolerance?
