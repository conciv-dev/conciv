# Segmentation spike: containers from a design PNG with ppu-ocv

Date 2026-11-01. Spike for `docs/designs/design-driver.md`, Open Questions, "Segmentation on real designs".
Everything lives in this directory; nothing in any repo was touched.

## Verdict

| criterion (design doc)                                                                                                                    | result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture targets: every DOM container (toolbar, cards, table, buttons, field) found within `geometryPx` (2 px), no container the DOM lacks | **PASS** (u1-1280, u1-390, plain-1280: 100% recall at 2 px, 100% precision, 0 spurious, threshold variants and components variants; Canny misses one button)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Real pages: top two levels of containers found                                                                                            | **FAIL** (best variant, levels 1 / 2 at 2 px: flat conciv.dev 50% / 57%, Stripe 14% / 0%, Guardian 64% / 33%)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Real pages: shadows, gradients, photographs become `image` leaves, not spurious frames                                                    | **Partial pass for photos and gradients, not tested for shadows.** Recommended variant: 0 to 3 spurious frames per real page. Guardian photos: 8 of 10 became image leaves, 1 became a frame. Stripe gradients: 3 of 9 became image leaves and none became a frame. Shadows: only 2 shadowed containers per page (conciv.dev, Stripe), and neither was found with or without the shadow trim, so this half is unmeasured. The price is that whole sections (the conciv.dev hero, Stripe's bento cards, Guardian's nav plus its whole content grid) become a single image leaf, and every container inside one is lost |

Per the doc's fail branch, the enricher should keep segmentation and fall back to text-only attachment (root plus OCR leaves) when the page fails a quality gate, and the x-ray should say so. The recommendation below proposes the gate.

## Setup

- `ppu-ocv` 4.0.0 (the catalog pin), loaded with `ImageProcessor.initRuntime()` as in `paddle.ts`. OpenCV does the morphology (`morphologyEx` close/open), `Canny`, and external contours plus `contourArea` through ppu-ocv's `Contours` (`getRect`). The per-pixel colour distance, the sRGB to Lab conversion and the flood fill are plain loops over typed arrays: OpenCV has no "distance from colour C" operation, and the loops cost 10 to 90 ms per page.
- Pages were rendered with Playwright Chromium 1.64.1 at deviceScaleFactor 1 (`render.ts`). Fixtures come from the aidx-text fixture host (`/?variant=target` at 1280x720 and 390x844, `/plain.html` at 1280x720). Real pages were rendered at 1280 wide with the viewport set to 1280x2400, so `vh` units and the screenshot agree with the DOM truth:
  - flat: https://conciv.dev/ (the local `apps/site` dev server answered 500 on unresolved deps after ~40 s, so the deployed site stands in for it)
  - shadows: Storybook `ui-kit-chat-tools-styled-tools-discoveredapiscard--list` from :6017. Every story has 4 to 5 box-shadows and no gradients, so this one is thin, and **https://stripe.com/ is the real shadows-and-gradients page**
  - photos: https://www.theguardian.com/international (unsplash.com returned "Access Denied" to headless Chromium). Consent overlays were removed
- Container truth (`truth.ts`): every element painting a background (alpha > 0), a border, a gradient or media (img/video/canvas/picture/url background), plus `header.toolbar, .card, [class*=card], .table, button, .field` regardless of paint. Boxes are clipped by `overflow` ancestors and the capture height. The measured set:
  - holds only _visible_ containers: fill differs from the nearest painted ancestor (sum of channel differences > 6), or a border on all four sides, or media or gradient
  - keeps both sides at least 24 px (`unmatchedMinimum`)
  - drops boxes the size of the page (those are the root)
  - dedupes identical boxes
  - keeps only containers that sit still between two collections around the screenshot (Stripe animates: 13 dropped; conciv.dev: 9)
- Level = 1 + the number of other truth containers containing the box.
- Match = every edge within 2 px (and separately 4 px). Precision counts a found rectangle as correct if it matches _any_ DOM element of the full truth list (visible or not) within the tolerance.
- The truth PNGs in `ocr-spike/targets` come from an older host checkout, where the first toolbar button is 78 px wide rather than 112. Run against the current DOM they score 86%, and the one "miss" is the button found at its true 78 px. Fresh renders are used throughout.

## Method (`segment.ts`)

Threshold variants (the design-doc method):

1. The root background is the median of the image's border pixels.
2. The mask is the pixels whose distance from the parent background exceeds T (RGB Euclidean 10, or Lab ΔE76 3).
3. Optional close or open with a 3x3 kernel.
4. External contours, keeping bounding rectangles with both sides at least 24 px; a contour that spans the whole region is skipped.
5. Classify each rectangle:
   - _Ink_ (dropped, left to the text enricher): `contourArea / box` < 0.85, or mask coverage < 0.6, and not an outlined box.
   - _Frame_: the share of the interior (inset 4 px) within T of the interior median is at least 0.5. An outlined box counts as a frame when coverage is low but the interior is at least 90% uniform and equal to the parent.
   - _Image_: everything else; images with both sides at least 64 px are kept even when they are not rectangular.
6. A frame's fill is the median of its interior.
7. **Tighten**: trim an edge line while under 50% of it matches the fill _and_ its median steps no more than 2T from the line outside it. This peels soft shadows but stops at borders and at children flush to the edge.
8. Recurse into the frame inset by 2 px against its fill. A child touching that inset grows back up to 2 px while the line matches its fill; without this, a button flush with the toolbar edge lost 3 px.

Components variants (region growing, added because the threshold method merges touching bands):

1. 4-connected flood fill with a fixed range T from the seed, seeding every 4 px.
2. A component is a frame when its box is at least 24x24, at least 70% of the box perimeter is its own pixels, it is not a gradient band (outside step ≤ 1.5T on two opposite sides), and it is not a ring (own pixels < 30% of the box with the interior dominated by one other component).
3. Same-colour components split by a line of 2 px or less merge, so table rows join.
4. Near-duplicate boxes (within 4 px) keep the largest component.
5. Parents are found by containment.
6. Images: within each frame, the pixels that are neither its own colour nor a child frame, opened, then external contours with coverage at least 0.6 and rectangularity at least 0.85.

Variants run: `threshold-rgb`, `threshold-rgb-notighten`, `threshold-rgb-open`, `threshold-lab`, `threshold-lab-open`, `threshold-lab-close`, `canny-dilate-lab` (Canny 20/50 on grey, dilate/close 3x3, classification in Lab), `threshold-rgb-adaptive` and `threshold-lab-adaptive` (open only when a contour spans the whole region), `components-rgb`, `components-lab`, and `threshold-rgb-recurse-images` (segment again inside image leaves against their border median).

## Results

### Variant comparison (recall at 2 px / precision at 4 px / spurious frames)

| variant                      | u1-1280         | u1-390          | plain-1280      | flat-conciv   | shadow-story  | shadow-stripe  | photo-guardian |
| ---------------------------- | --------------- | --------------- | --------------- | ------------- | ------------- | -------------- | -------------- |
| threshold-rgb                | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 47% / 94% / 0 | 50% / 67% / 1 | 5% / 75% / 0   | 52% / 65% / 3  |
| threshold-rgb-notighten      | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 47% / 94% / 0 | 50% / 67% / 1 | 5% / 75% / 0   | 57% / 75% / 1  |
| threshold-rgb-open           | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 25% / 80% / 2 | 50% / 50% / 1 | 14% / 53% / 1  | 57% / 71% / 3  |
| threshold-lab                | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 44% / 93% / 0 | 50% / 67% / 1 | 5% / 71% / 0   | 52% / 65% / 3  |
| threshold-lab-open           | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 28% / 83% / 0 | 50% / 50% / 1 | 14% / 43% / 1  | 57% / 71% / 3  |
| threshold-lab-close          | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 34% / 67% / 5 | 50% / 50% / 1 | 5% / 71% / 0   | 52% / 65% / 3  |
| canny-dilate-lab             | 86% / 100% / 0  | 86% / 100% / 0  | 100% / 100% / 0 | 44% / 88% / 0 | 0% / 50% / 1  | 11% / 58% / 0  | 48% / 67% / 1  |
| threshold-rgb-adaptive       | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 47% / 94% / 0 | 50% / 67% / 1 | 14% / 53% / 1  | 52% / 65% / 3  |
| threshold-lab-adaptive       | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 44% / 93% / 0 | 50% / 67% / 1 | 14% / 43% / 1  | 52% / 65% / 3  |
| components-rgb               | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 53% / 68% / 7 | 0% / 67% / 1  | 27% / 66% / 10 | 52% / 72% / 4  |
| components-lab               | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 47% / 64% / 7 | 0% / 67% / 1  | 27% / 72% / 8  | 52% / 68% / 4  |
| threshold-rgb-recurse-images | 100% / 100% / 0 | 100% / 100% / 0 | 100% / 100% / 0 | 47% / 94% / 0 | 50% / 67% / 1 | 5% / 75% / 0   | 52% / 61% / 3  |

### Time per page (ms, segmentation only; Lab conversion of the whole page adds the "prep" figure once)

| variant                      | u1-1280 | u1-390 | plain-1280 | flat-conciv | shadow-story | shadow-stripe | photo-guardian |
| ---------------------------- | ------- | ------ | ---------- | ----------- | ------------ | ------------- | -------------- |
| threshold-rgb                | 98      | 38     | 55         | 361         | 89           | 388           | 1182           |
| threshold-rgb-notighten      | 69      | 32     | 53         | 359         | 92           | 397           | 1138           |
| threshold-rgb-open           | 74      | 33     | 59         | 329         | 93           | 528           | 648            |
| threshold-lab                | 97      | 34     | 60         | 548         | 98           | 681           | 2247           |
| threshold-lab-open           | 92      | 36     | 66         | 395         | 101          | 1009          | 990            |
| threshold-lab-close          | 85      | 37     | 63         | 620         | 109          | 727           | 2206           |
| canny-dilate-lab             | 111     | 41     | 72         | 513         | 128          | 994           | 2042           |
| threshold-rgb-adaptive       | 76      | 33     | 54         | 357         | 94           | 548           | 1164           |
| threshold-lab-adaptive       | 81      | 37     | 65         | 534         | 98           | 1004          | 2157           |
| components-rgb               | 62      | 38     | 61         | 155         | 106          | 262           | 219            |
| components-lab               | 61      | 21     | 33         | 159         | 113          | 252           | 216            |
| threshold-rgb-recurse-images | 77      | 32     | 53         | 358         | 96           | 407           | 1244           |
| prep (decode + Lab)          | 24      | 10     | 25         | 77          | 33           | 83            | 86             |

### u1-1280 (threshold-rgb-adaptive)

| metric                                                                      | value                     |
| --------------------------------------------------------------------------- | ------------------------- |
| truth containers (visible, both sides >= 24 px, deduped)                    | 7 (named: 7)              |
| found                                                                       | 7 (7 frames, 0 images)    |
| recall within 2 px / 4 px                                                   | 100% / 100%               |
| named recall (toolbar, cards, table, buttons, field) 2 px                   | 100%                      |
| precision within 2 px / 4 px                                                | 100% / 100%               |
| level 1 recall 2 px / 4 px (5 containers)                                   | 100% / 100%               |
| level 2 recall 2 px / 4 px (2 containers)                                   | 100% / 100%               |
| nesting depth: found / truth / deepest matched truth level                  | 2 / 2 / 2                 |
| page area under top-level image leaves (sum of boxes; overlaps count twice) | 0%                        |
| spurious frames / spurious images                                           | 0 / 0                     |
| time                                                                        | 76 ms (+24 ms decode/Lab) |

### u1-390 (threshold-rgb-adaptive)

| metric                                                                      | value                     |
| --------------------------------------------------------------------------- | ------------------------- |
| truth containers (visible, both sides >= 24 px, deduped)                    | 7 (named: 7)              |
| found                                                                       | 7 (7 frames, 0 images)    |
| recall within 2 px / 4 px                                                   | 100% / 100%               |
| named recall (toolbar, cards, table, buttons, field) 2 px                   | 100%                      |
| precision within 2 px / 4 px                                                | 100% / 100%               |
| level 1 recall 2 px / 4 px (5 containers)                                   | 100% / 100%               |
| level 2 recall 2 px / 4 px (2 containers)                                   | 100% / 100%               |
| nesting depth: found / truth / deepest matched truth level                  | 2 / 2 / 2                 |
| page area under top-level image leaves (sum of boxes; overlaps count twice) | 0%                        |
| spurious frames / spurious images                                           | 0 / 0                     |
| time                                                                        | 33 ms (+10 ms decode/Lab) |

### plain-1280 (threshold-rgb-adaptive)

| metric                                                                      | value                     |
| --------------------------------------------------------------------------- | ------------------------- |
| truth containers (visible, both sides >= 24 px, deduped)                    | 2 (named: 0)              |
| found                                                                       | 2 (2 frames, 0 images)    |
| recall within 2 px / 4 px                                                   | 100% / 100%               |
| named recall (toolbar, cards, table, buttons, field) 2 px                   | n/a                       |
| precision within 2 px / 4 px                                                | 100% / 100%               |
| level 1 recall 2 px / 4 px (2 containers)                                   | 100% / 100%               |
| nesting depth: found / truth / deepest matched truth level                  | 1 / 1 / 1                 |
| page area under top-level image leaves (sum of boxes; overlaps count twice) | 0%                        |
| spurious frames / spurious images                                           | 0 / 0                     |
| time                                                                        | 54 ms (+25 ms decode/Lab) |

### flat-conciv (threshold-rgb-adaptive)

| metric                                                                      | value                      |
| --------------------------------------------------------------------------- | -------------------------- |
| truth containers (visible, both sides >= 24 px, deduped)                    | 32                         |
| found                                                                       | 16 (15 frames, 1 images)   |
| recall within 2 px / 4 px                                                   | 47% / 47%                  |
| precision within 2 px / 4 px                                                | 94% / 94%                  |
| level 1 recall 2 px / 4 px (12 containers)                                  | 50% / 50%                  |
| level 2 recall 2 px / 4 px (14 containers)                                  | 57% / 57%                  |
| level 3 recall 2 px / 4 px (4 containers)                                   | 25% / 25%                  |
| nesting depth: found / truth / deepest matched truth level                  | 2 / 4 / 3                  |
| media elements: as image leaf / as frame (of total)                         | 0 / 0 (of 2)               |
| gradient elements: as image / as frame (of total)                           | 0 / 0 (of 4)               |
| shadowed elements: exact / frame swollen by shadow (of total)               | 0 / 0 (of 2)               |
| page area under top-level image leaves (sum of boxes; overlaps count twice) | 17%                        |
| spurious frames / spurious images                                           | 0 / 1                      |
| time                                                                        | 357 ms (+77 ms decode/Lab) |

Missed (17, first 15):

| tag.class                | fill                                     | size at            | level | flags    | nearest found  |
| ------------------------ | ---------------------------------------- | ------------------ | ----- | -------- | -------------- |
| canvas.absolute          | rgba(0, 0, 0, 0)                         | 1280x597 @ 0,76    | 1     | media    | frame iou 0.01 |
| div.pointer-events-none  | rgba(0, 0, 0, 0)                         | 559x533 @ 651,104  | 2     | gradient | image iou 0    |
| button.flex              | rgba(0, 0, 0, 0)                         | 110x28 @ 862,126   | 3     |          | image iou 0    |
| div.flex                 | oklch(0.965 0.008 70)                    | 242x98 @ 675,515   | 3     |          | image iou 0    |
| button.group/button      | oklch(0.6 0.207 27)                      | 124x28 @ 688,570   | 4     |          | image iou 0    |
| div.od-preview           | oklch(0.985 0.006 75)                    | 268x460 @ 930,165  | 3     | gradient | image iou 0    |
| button.od-cta            | oklch(0.23 0.012 65)                     | 103x40 @ 1013,417  | 4     |          | image iou 0    |
| section.border-y         | oklab(0.985 0.00155291 0.00579555 / 0.5) | 1280x82 @ 0,673    | 1     |          | image iou 0    |
| pre.overflow-x-auto      | oklch(0.995 0.004 75)                    | 467x47 @ 731,1591  | 1     |          | image iou 0.04 |
| div.flex                 | oklch(0.995 0.004 75)                    | 467x42 @ 731,1763  | 1     |          | image iou 0.04 |
| span.absolute            | oklch(0.985 0.006 75)                    | 78x34 @ 735,1767   | 2     | shadow   | image iou 0    |
| span.pointer-events-none | rgba(0, 0, 0, 0)                         | 32x36 @ 1163,1766  | 2     | gradient | image iou 0    |
| div.overflow-hidden      | oklch(0.995 0.004 75)                    | 467x288 @ 731,1815 | 1     |          | image iou 0.25 |
| button.group             | oklch(0.985 0.006 75)                    | 28x28 @ 1155,1824  | 2     |          | image iou 0    |
| span.pointer-events-none | rgba(0, 0, 0, 0)                         | 32x241 @ 1165,1861 | 2     | gradient | image iou 0.01 |

Spurious (1):

| kind  | box                | depth | covers      |
| ----- | ------------------ | ----- | ----------- |
| image | 661x809 @ 619,1591 | 1     | photo/media |

### shadow-story (threshold-rgb-adaptive)

| metric                                                                      | value                     |
| --------------------------------------------------------------------------- | ------------------------- |
| truth containers (visible, both sides >= 24 px, deduped)                    | 2                         |
| found                                                                       | 3 (3 frames, 0 images)    |
| recall within 2 px / 4 px                                                   | 50% / 50%                 |
| precision within 2 px / 4 px                                                | 67% / 67%                 |
| level 1 recall 2 px / 4 px (1 containers)                                   | 0% / 0%                   |
| level 2 recall 2 px / 4 px (1 containers)                                   | 100% / 100%               |
| nesting depth: found / truth / deepest matched truth level                  | 3 / 2 / 2                 |
| media elements: as image leaf / as frame (of total)                         | 0 / 0 (of 0)              |
| gradient elements: as image / as frame (of total)                           | 0 / 0 (of 0)              |
| shadowed elements: exact / frame swollen by shadow (of total)               | 0 / 0 (of 0)              |
| page area under top-level image leaves (sum of boxes; overlaps count twice) | 0%                        |
| spurious frames / spurious images                                           | 1 / 0                     |
| time                                                                        | 94 ms (+33 ms decode/Lab) |

Missed (1):

| tag.class | fill            | size at         | level | flags | nearest found  |
| --------- | --------------- | --------------- | ----- | ----- | -------------- |
| div.      | rgb(23, 22, 26) | 560x150 @ 16,16 | 1     |       | frame iou 0.99 |

Spurious (1):

| kind  | box             | depth | covers               |
| ----- | --------------- | ----- | -------------------- |
| frame | 568x150 @ 16,16 | 1     | near div. (iou 0.99) |

### shadow-stripe (threshold-rgb-adaptive)

| metric                                                                      | value                      |
| --------------------------------------------------------------------------- | -------------------------- |
| truth containers (visible, both sides >= 24 px, deduped)                    | 37                         |
| found                                                                       | 19 (11 frames, 8 images)   |
| recall within 2 px / 4 px                                                   | 14% / 14%                  |
| precision within 2 px / 4 px                                                | 53% / 53%                  |
| level 1 recall 2 px / 4 px (7 containers)                                   | 14% / 14%                  |
| level 2 recall 2 px / 4 px (12 containers)                                  | 0% / 0%                    |
| level 3 recall 2 px / 4 px (6 containers)                                   | 0% / 0%                    |
| nesting depth: found / truth / deepest matched truth level                  | 2 / 5 / 4                  |
| media elements: as image leaf / as frame (of total)                         | 0 / 0 (of 9)               |
| gradient elements: as image / as frame (of total)                           | 3 / 0 (of 9)               |
| shadowed elements: exact / frame swollen by shadow (of total)               | 0 / 0 (of 2)               |
| page area under top-level image leaves (sum of boxes; overlaps count twice) | 48%                        |
| spurious frames / spurious images                                           | 1 / 8                      |
| time                                                                        | 548 ms (+83 ms decode/Lab) |

Missed (32, first 15):

| tag.class                                                 | fill                      | size at            | level | flags    | nearest found  |
| --------------------------------------------------------- | ------------------------- | ------------------ | ----- | -------- | -------------- |
| a.hds-button                                              | rgba(0, 0, 0, 0)          | 84x40 @ 1017,18    | 2     |          | image iou 0    |
| a.hds-button                                              | rgb(83, 58, 253)          | 137x40 @ 1109,18   | 2     |          | image iou 0.01 |
| a.hds-button                                              | rgba(255, 255, 255, 0.65) | 212x48 @ 285,626   | 2     |          | image iou 0.01 |
| canvas.single-wave__canvas                                | rgba(0, 0, 0, 0)          | 1023x975 @ 257,0   | 1     | media    | image iou 0.92 |
| div.modular-solutions-bento-card__border                  | rgb(229, 237, 245)        | 813x680 @ 27,1236  | 1     |          | image iou 0.06 |
| div.modular-solutions-bento-card__border-color-gradient   | rgba(0, 0, 0, 0)          | 740x680 @ 64,1236  | 2     | gradient | image iou 0.06 |
| picture.payments-graphic__terminal-image                  | rgba(0, 0, 0, 0)          | 280x477 @ 46,1395  | 2     | media    | image iou 0    |
| div.payments-graphic__terminal-transaction-button         | rgb(255, 224, 209)        | 154x26 @ 108,1721  | 4     |          | image iou 0    |
| div.browser-graphic__window                               | rgba(248, 250, 253, 0.45) | 519x518 @ 320,1397 | 2     | shadow   | image iou 0.04 |
| div.payments-graphic__checkout-payment-methods-card-input | rgb(248, 250, 253)        | 225x30 @ 370,1681  | 4     |          | image iou 0    |
| div.payments-graphic__checkout-payment-methods-card-input | rgb(248, 250, 253)        | 110x30 @ 370,1716  | 4     |          | image iou 0    |
| div.payments-graphic__checkout-payment-methods-card-input | rgb(248, 250, 253)        | 110x30 @ 485,1716  | 4     |          | image iou 0    |
| div.payments-graphic__checkout-item-card                  | rgb(255, 255, 255)        | 169x96 @ 670,1556  | 3     |          | image iou 0    |
| picture.payments-graphic__checkout-item-card-image        | rgba(0, 0, 0, 0)          | 80x86 @ 675,1561   | 5     | media    | image iou 0    |
| div.modular-solutions-bento-card__border                  | rgb(229, 237, 245)        | 406x684 @ 846,1234 | 1     |          | image iou 0.72 |

Spurious (9):

| kind  | box                | depth | covers      |
| ----- | ------------------ | ----- | ----------- |
| image | 67x88 @ 849,2312   | 1     | photo/media |
| image | 72x84 @ 259,2288   | 2     | photo/media |
| image | 74x77 @ 125,2291   | 2     | photo/media |
| image | 395x374 @ 32,2026  | 1     | photo/media |
| image | 395x402 @ 441,1998 | 1     | photo/media |
| frame | 241x29 @ 362,1797  | 1     | photo/media |
| image | 399x500 @ 849,1413 | 1     | gradient    |
| image | 320x111 @ 516,1321 | 1     | photo/media |
| image | 944x975 @ 336,0    | 1     | photo/media |

### photo-guardian (threshold-rgb-adaptive)

| metric                                                                      | value                       |
| --------------------------------------------------------------------------- | --------------------------- |
| truth containers (visible, both sides >= 24 px, deduped)                    | 21                          |
| found                                                                       | 17 (6 frames, 11 images)    |
| recall within 2 px / 4 px                                                   | 52% / 52%                   |
| precision within 2 px / 4 px                                                | 65% / 65%                   |
| level 1 recall 2 px / 4 px (14 containers)                                  | 64% / 64%                   |
| level 2 recall 2 px / 4 px (6 containers)                                   | 33% / 33%                   |
| level 3 recall 2 px / 4 px (1 containers)                                   | 0% / 0%                     |
| nesting depth: found / truth / deepest matched truth level                  | 2 / 3 / 2                   |
| media elements: as image leaf / as frame (of total)                         | 8 / 1 (of 10)               |
| gradient elements: as image / as frame (of total)                           | 0 / 0 (of 2)                |
| shadowed elements: exact / frame swollen by shadow (of total)               | 0 / 0 (of 0)                |
| page area under top-level image leaves (sum of boxes; overlaps count twice) | 103%                        |
| spurious frames / spurious images                                           | 3 / 3                       |
| time                                                                        | 1164 ms (+86 ms decode/Lab) |

Missed (10):

| tag.class                   | fill                  | size at           | level | flags    | nearest found  |
| --------------------------- | --------------------- | ----------------- | ----- | -------- | -------------- |
| div.top-banner-ad-container | rgb(246, 246, 246)    | 1280x295 @ 0,0    | 1     |          | frame iou 0.6  |
| section.dcr-1xdhyk6         | rgb(4, 31, 74)        | 1280x64 @ 0,295   | 1     |          | frame iou 0.75 |
| div.dcr-bpr716              | rgb(255, 244, 242)    | 300x118 @ 890,367 | 1     |          | frame iou 0.9  |
| picture.dcr-1rsklsq         | rgba(0, 0, 0, 0)      | 98x98 @ 1082,377  | 2     | media    | image iou 0.77 |
| div.dcr-vbq6c6              | rgba(0, 0, 0, 0)      | 60x134 @ 1130,359 | 1     | gradient | image iou 0.21 |
| button.dcr-1qr4kco          | rgb(5, 41, 98)        | 36x36 @ 1154,408  | 3     |          | image iou 0.01 |
| nav.dcr-lypmm               | rgb(5, 41, 98)        | 1280x171 @ 0,493  | 1     |          | image iou 0.09 |
| span.dcr-rg4uo3             | rgb(255, 229, 0)      | 40x40 @ 720,566   | 2     |          | image iou 0    |
| div.dcr-1k3r8vt             | rgba(0, 0, 0, 0)      | 40x44 @ 1150,620  | 2     | gradient | image iou 0    |
| button.dcr-16bgv17          | rgba(18, 18, 18, 0.7) | 32x32 @ 1150,1132 | 2     |          | image iou 0    |

Spurious (6):

| kind  | box                | depth | covers                         |
| ----- | ------------------ | ----- | ------------------------------ |
| image | 216x127 @ 732,1701 | 2     | photo/media                    |
| image | 1280x1907 @ 0,493  | 1     | photo/media                    |
| frame | 269x118 @ 890,367  | 1     | photo/media                    |
| image | 75x98 @ 1082,377   | 2     | photo/media                    |
| frame | 970x335 @ 155,24   | 1     | near div.dcr-w1c4lt (iou 0.60) |
| frame | 968x65 @ 155,294   | 2     | near div.dcr-48gntr (iou 0.87) |

## What the failures are

The full lists are in the tables above. Overlays are in `out/<page>.<variant>.png`: green is a frame, red is an image, blue is a truth container that was missed.

- **Sections with a painted effect become one image.** On conciv.dev the hero (a dot canvas, a gradient glow and an app mock) is a single image leaf, so the hero buttons, the `od-preview` panel and its CTA are all lost. On Stripe each bento card holds an animated canvas and a gradient border, so every card is an image leaf, or is cut where its graphic bleeds, and nothing at level 2 survives. Segmenting again inside image leaves against their border median (`threshold-rgb-recurse-images`) recovered nothing: the contour inside spans the leaf again.
- **Touching bands merge.** On the Guardian, the grey ad band (0 to 295) and the navy masthead (295 to 359) touch, so they form one contour classified as a grey frame with the wrong box. The navy nav (493 to 664) touches the content grid, whose 1 px column rules join everything below it into one 1280x1907 image. Opening breaks the rules on Stripe and the Guardian but erases conciv.dev's outlined cards (47% falls to 25%), so it is applied only when a contour spans the region (`adaptive`). Region growing (`components`) separates the bands but adds 4 to 10 spurious frames per real page: flat runs inside photos, gradient steps, and hero areas.
- **Elements below the minimum.** Many of the misses are 28 to 40 px buttons and icon chips inside a lost section. They cannot be found once their parent is an image.
- **Shadows were barely exercised.** The real pages hold 2 shadowed containers each (conciv.dev, Stripe), neither was found with or without the soft-edge tighten, and no frame was swollen by a shadow either way. Tighten changes nothing on the fixtures, conciv.dev and Stripe, and it _hurts_ the Guardian (57% falls to 52%, 1 spurious frame rises to 3) by trimming merged bands to a wrong core. It stays in the recommendation only as the mechanism for designer exports with soft card shadows, and that is unproven: a page with shadowed cards on a flat background has to be measured before relying on it. The one spurious frame on the story is a second panel sitting 8 px to the right of the card, which merges with it.
- **Text never became a spurious container** in the threshold variants: the coverage and rectangularity filters drop glyphs and words. With `close` (2 px) words join into blocks and conciv.dev gains 5 spurious frames, so do not close.

## Variant comparison in short

- **RGB vs Lab**: no gain from Lab. Recall is equal or 3 points lower, precision is equal on most pages and 10 points lower on Stripe (adaptive: 53% to 43%), and segmentation takes 1.5 to 1.9x longer (it compares three floats per pixel, plus 10 to 90 ms to convert the page). RGB Euclidean 10 separates `#ffffff` from `#eef1f5` (distance 24); Lab needs ΔE 3 for the same pair (ΔE ≈ 5), right at `colorDeltaE`.
- **Threshold vs Canny plus dilate**: Canny is worse on the fixtures (misses the Create button: its edge merges with the toolbar edge after the dilate, 86% recall) and no better on real pages. Its outline contours also blur the box by the dilate radius, so the box needs the same tighten pass anyway.
- **Plain vs adaptive open**: adaptive equals plain on the fixtures and conciv.dev and takes Stripe from 5% to 14% recall. It is the best threshold variant overall.
- **Threshold vs components (region growing)**: components has the best recall on Stripe (27%) and is 3 to 5x faster on photo pages (about 220 ms against 1.1 s). It is exact on the fixtures too, but produces many spurious frames on real pages. It is the more promising base if a gradient and photo filter is added, and the spike did not get there.

## Recommendation

1. **Variant:** `threshold-rgb-adaptive` as the enricher's first version. It is exact on the fixtures, has 0 to 3 spurious frames on real pages, and runs in 33 to 76 ms for a fixture page and 0.36 to 1.2 s for a 1280x2400 page, plus 10 to 90 ms to decode. It needs no new dependency, and every OpenCV call is from ppu-ocv 4.0.0.
2. **Constants:**

   | constant                  | value                                         |
   | ------------------------- | --------------------------------------------- |
   | colour distance           | RGB Euclidean 10 (not Lab)                    |
   | minimum side              | 24 (`unmatchedMinimum`)                       |
   | interior inset            | 4 (`interiorInset`)                           |
   | uniform share             | 0.5                                           |
   | rectangularity            | 0.85                                          |
   | mask coverage             | 0.6                                           |
   | outline uniform share     | 0.9                                           |
   | large image side          | 64                                            |
   | child inset and grow-back | 2                                             |
   | tighten soft step         | 2 x distance (unproven: see the shadows note) |
   | adaptive open             | 3x3, only when a contour spans the region     |
   | depth cap                 | 6                                             |

   Never close the mask: words join into blocks.

3. **A region that is neither uniform nor text:** emit an `image` leaf with its box, its median colour as a hint only, and `segmented: true`, so no enricher recurses into it. Recursing does not help, as measured above. Stage estimates should skip image leaves: no `layout` and no `radius`, and text inside one attaches to the image leaf, not to a frame.
4. **The fail branch is needed for real designs.** Add a quality gate on the result: if image leaves at depth 1 cover more than a fixed share of the page, or the tree has fewer than two frame levels, mark the target "segmentation partial". The share is a new constant; 30% would put Stripe (48%) and the Guardian (most of the page) into the fallback and keep conciv.dev (17%). On such a target, keep the frames that were found, attach text to the smallest one, and have the x-ray say which areas are images. Do not trust stage estimates for nodes under an image leaf.
5. **Before trusting real designs**, the plan's added measurement step should try the components variant with a gradient and photo filter (merge adjacent components whose colours step by less than 1.5T into one `image`, and reject frames whose interior holds many distinct components). Designer exports are usually flatter than live marketing pages (no canvases, no decorative grid rules), so a run on two or three real Figma PNG exports should precede that work.

## Files

| file         | purpose                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `segment.ts` | the segmenter (threshold, adaptive and components variants, constants): basis for `server/enrichers/segment.ts` |
| `truth.ts`   | DOM container-truth collector                                                                                   |
| `render.ts`  | renders the pages and truth with Playwright                                                                     |
| `spike.ts`   | runs every variant, computes metrics, writes `out/results.json` and the overlays                                |
| `report.ts`  | writes the tables (`node --experimental-strip-types report.ts <variant>`)                                       |

Overlay images exist for every page and variant: `out/<page>.<variant>.png`. `out/tables.components-lab.md` holds the per-page tables for region growing.

Rerun: `node --experimental-strip-types render.ts && node --experimental-strip-types spike.ts && node --experimental-strip-types report.ts threshold-rgb-adaptive`.
