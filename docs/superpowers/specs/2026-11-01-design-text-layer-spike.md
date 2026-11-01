# OCR spike record: reading UI text out of design target PNGs

Companion to `2026-11-01-design-text-layer.md`. This file is a verbatim copy of the spike's `results.md` (measured 2026-11-01 on an Apple Silicon Mac, Node 22.21.1) followed by the two source files the design ports: the wasm service construction and the ink trim. The spike's scripts, raw OCR output and targets are not in the repo; the numbers below are the evidence the design cites.

---

# OCR spike: reading UI text out of design target PNGs

All numbers measured on this Mac (Apple Silicon, Node 22.21.1) on 2026-11-01. Scripts: `render.ts` (targets + DOM ground truth), `engines/*/run.ts` (one per candidate), `score.ts` (matching), `report.ts` (this file). Raw OCR output: `raw/<engine>/<setting>.json`; per-image scores: `scores.json`; targets and ground truth: `targets/`.

## Method

- Targets: the three fixture pages from `packages/it/test/fixtures/design/render-targets.ts` (aidx-659, `design-text-mask` @ 4e5c87adf), plus `small-390` (`small.html` in this dir: 11 to 14px Arial, gray/faint/white-on-blue/white-on-dark chips) because the fixture has no text below 16px. Each page shot by Chromium at 1x, Chromium native 2x (`deviceScaleFactor: 2`), Chromium with `--disable-lcd-text --disable-font-subpixel-positioning` (`chromium-nolcd`) and Firefox. Every 1x shot also upscaled 2x nearest-neighbour (`@1x-up2`, same as `upscale2x` in render-targets.ts). 28 PNGs.
- Ground truth: every visible text node, `Range.getClientRects()` per fragment, string whitespace-collapsed, font size, color, nearest painted background. The input placeholder (`Search invoices`) is not a text node; it is kept as a `placeholder` entry so an OCR read of it counts as correct for precision, but it is excluded from recall.
- Matching: an edge joins a ground-truth run and an OCR box when their overlap is above half the smaller box. Each connected group of runs and OCR boxes matches when the runs' text and the OCR text, each joined in reading order, are equal after removing whitespace and case folding. This lets a line-level OCR box (`Export Create`) match two adjacent DOM runs, and word-level boxes (`Search` + `invoices`) match one run. **Recall** = runs (text nodes, font >= 11px) in matched groups / all runs. **Precision** = OCR boxes in matched groups / all non-empty OCR boxes. **Strict recall** = the brief's literal per-run rule (the OCR boxes over one run read exactly that run, no group join); it punishes line-level engines whose one box spans two runs.
- Box error: max absolute edge distance in CSS px between the union of a matched group's run rects and its OCR boxes. The DOM rect is the line box (17px tall for 16px Arial), so a few px of vertical error is the line-height, not OCR error. "Spans" = matched groups whose OCR box covers the run horizontally (what the mask needs).
- Timing: warm = median per-image `recognize` on a loaded engine; first run = engine creation + first image.

## Every setting, all 28 PNGs

| engine         | setting                              | recall | strict recall | precision | box err median / max (px) | warm ms (median) | first run ms |
| -------------- | ------------------------------------ | ------ | ------------- | --------- | ------------------------- | ---------------- | ------------ |
| gutenye        | ppocrv4-default                      | 91.3%  | 4.3%          | 92.5%     | 4.0 / 10.0                | 1111             | 1125         |
| ppu-paddle-ocr | v5-en-mobile-per-box                 | 85.4%  | 84.2%         | 87.8%     | 8.5 / 19.9                | 271              | 393          |
| ppu-paddle-ocr | v5-en-mobile-per-line                | 70.8%  | 68.9%         | 74.9%     | 8.2 / 19.9                | 188              | 168          |
| ppu-paddle-ocr | v6-small-per-box                     | 93.5%  | 68.0%         | 79.9%     | 16.0 / 43.7               | 425              | 283          |
| ppu-paddle-ocr | v6-small-per-line                    | 89.1%  | 63.7%         | 78.1%     | 16.0 / 43.7               | 218              | 260          |
| ppu-paddle-ocr | v6-tiny-per-box                      | 99.7%  | 81.1%         | 99.7%     | 6.0 / 15.0                | 102              | 211          |
| ppu-paddle-ocr | v6-tiny-per-box-native-timed         | 99.7%  | 81.1%         | 99.7%     | 6.0 / 15.0                | 106              | 817          |
| ppu-paddle-ocr | v6-tiny-per-box-pad0                 | 99.7%  | 81.1%         | 99.7%     | 6.0 / 15.0                | 89               | 89           |
| ppu-paddle-ocr | v6-tiny-per-box-pad0.2               | 90.7%  | 78.0%         | 93.4%     | 2.0 / 8.2                 | 76               | 201          |
| ppu-paddle-ocr | v6-tiny-per-box-trim                 | 99.7%  | 81.1%         | 99.7%     | 3.0 / 8.2                 | 165              | 211          |
| ppu-paddle-ocr | v6-tiny-per-box-wasm-t0              | 99.7%  | 81.1%         | 99.7%     | 6.0 / 15.0                | 315              | 1989         |
| ppu-paddle-ocr | v6-tiny-per-box-wasm-t1              | 99.7%  | 81.1%         | 99.7%     | 6.0 / 15.0                | 341              | 1717         |
| ppu-paddle-ocr | v6-tiny-per-box-wasm-t4              | 99.7%  | 81.1%         | 99.7%     | 6.0 / 15.0                | 181              | 1256         |
| ppu-paddle-ocr | v6-tiny-per-line                     | 99.7%  | 81.1%         | 98.4%     | 6.0 / 15.0                | 98               | 89           |
| tesseract      | best_int-psm11                       | 76.1%  | 76.1%         | 92.1%     | 3.0 / 6.4                 | 205              | 352          |
| tesseract      | best_int-psm3                        | 75.5%  | 75.5%         | 87.5%     | 3.0 / 8.0                 | 239              | 465          |
| tesseract      | best_int-psm6                        | 75.8%  | 75.8%         | 90.0%     | 3.0 / 6.4                 | 202              | 769          |
| tesseract      | fast-psm11                           | 76.7%  | 76.7%         | 93.5%     | 3.0 / 6.4                 | 190              | 732          |
| tesseract      | fast-psm3                            | 76.4%  | 76.4%         | 88.4%     | 3.0 / 8.0                 | 198              | 1118         |
| tesseract      | fast-psm6                            | 77.3%  | 77.3%         | 92.2%     | 3.0 / 13.0                | 194              | 811          |
| transformers   | florence2-base-fp32-tile768 (9 PNGs) | 79.9%  | 74.6%         | 68.9%     | 1.5 / 5.0                 | 15543            | 9159         |
| transformers   | florence2-base-fp32-whole            | 91.9%  | 74.2%         | 90.5%     | 2.0 / 5.1                 | 3359             | 19052        |
| transformers   | florence2-base-q8-whole              | 84.2%  | 70.5%         | 83.4%     | 2.1 / 4.5                 | 2163             | 3423         |

Best setting per engine used below: tesseract `fast-psm11`, gutenye `ppocrv4-default`, ppu-paddle-ocr `v6-tiny-per-box`, transformers `florence2-base-fp32-whole`.

## u1-390

### u1-390.chromium@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 5.0            | 8/13  | 105     |
| gutenye               | 15/15  | 0/15   | 7/7       | 4.1 / 5.0            | 0/6   | 692     |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 7.6 / 9.0            | 15/15 | 59      |
| transformers          | 13/15  | 13/15  | 14/16     | 1.5 / 3.7            | 13/13 | 3250    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `7000` (24px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `70000`
- transformers: `INV-002` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `INV_002`

### u1-390.chromium@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 5.0            | 8/13  | 190     |
| gutenye               | 15/15  | 0/15   | 7/7       | 2.5 / 3.0            | 0/6   | 1322    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 5.2 / 7.0            | 15/15 | 110     |
| transformers          | 13/15  | 13/15  | 14/16     | 2.0 / 4.5            | 13/13 | 3764    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `7000` (24px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `70000`
- transformers: `INV-002` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `INV_002`

### u1-390.chromium@2x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 4.5            | 10/13 | 273     |
| gutenye               | 15/15  | 0/15   | 7/7       | 2.9 / 3.0            | 0/6   | 1241    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 5.2 / 6.5            | 15/15 | 91      |
| transformers          | 13/15  | 13/15  | 14/16     | 2.4 / 4.5            | 13/13 | 3359    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `7000` (24px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `70000`
- transformers: `INV-002` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `INV_002`

### u1-390.chromium-nolcd@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 5.0            | 8/13  | 140     |
| gutenye               | 15/15  | 0/15   | 7/7       | 4.1 / 5.0            | 0/6   | 813     |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 7.6 / 9.0            | 15/15 | 55      |
| transformers          | 13/15  | 13/15  | 14/16     | 1.5 / 3.7            | 13/13 | 3427    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `7000` (24px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `70000`
- transformers: `INV-002` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `INV_002`

### u1-390.chromium-nolcd@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 5.0            | 8/13  | 249     |
| gutenye               | 15/15  | 0/15   | 7/7       | 2.5 / 3.0            | 0/6   | 1274    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 5.2 / 7.0            | 15/15 | 125     |
| transformers          | 13/15  | 13/15  | 14/16     | 2.0 / 4.5            | 13/13 | 3480    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `7000` (24px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `70000`
- transformers: `INV-002` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `INV_002`

### u1-390.firefox@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 4.1 / 6.4            | 9/13  | 132     |
| gutenye               | 15/15  | 0/15   | 7/7       | 4.3 / 5.0            | 0/6   | 882     |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 7.0 / 9.0            | 15/15 | 72      |
| transformers          | 13/15  | 13/15  | 14/16     | 2.5 / 4.1            | 13/13 | 3547    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `7000` (24px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `700`
- transformers: `INV-002` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `INV_002`

### u1-390.firefox@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 4.1 / 6.4            | 9/13  | 225     |
| gutenye               | 15/15  | 0/15   | 7/7       | 2.5 / 4.4            | 0/6   | 791     |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 5.0 / 7.5            | 15/15 | 146     |
| transformers          | 14/15  | 14/15  | 15/16     | 2.5 / 4.1            | 14/14 | 5863    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `7000` (24px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `700`

## u1-1280

### u1-1280.chromium@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 5.0            | 9/13  | 163     |
| gutenye               | 15/15  | 0/15   | 7/7       | 5.7 / 9.5            | 6/6   | 777     |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 10.0 / 15.0          | 15/15 | 80      |
| transformers          | 15/15  | 15/15  | 16/16     | 1.8 / 3.5            | 15/15 | 3492    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`

### u1-1280.chromium@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 5.0            | 9/13  | 289     |
| gutenye               | 15/15  | 0/15   | 7/7       | 1.5 / 3.0            | 6/6   | 2052    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 5.9 / 8.5            | 15/15 | 183     |
| transformers          | 14/15  | 14/15  | 14/16     | 1.8 / 3.5            | 14/14 | 3688    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `Acme` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Ame`
- transformers: extra box `Search involes`

### u1-1280.chromium@2x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 4.5            | 10/13 | 320     |
| gutenye               | 15/15  | 0/15   | 7/7       | 1.5 / 3.0            | 6/6   | 3258    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 5.6 / 8.0            | 15/15 | 170     |
| transformers          | 13/15  | 13/15  | 13/16     | 1.6 / 3.5            | 13/13 | 4818    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `Globex` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Globalx`
- transformers: `860` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `80`
- transformers: extra box `Search involes`

### u1-1280.chromium-nolcd@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 5.0            | 9/13  | 117     |
| gutenye               | 15/15  | 0/15   | 7/7       | 5.7 / 9.5            | 6/6   | 1354    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 10.0 / 15.0          | 15/15 | 90      |
| transformers          | 15/15  | 15/15  | 16/16     | 1.8 / 3.5            | 15/15 | 2897    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`

### u1-1280.chromium-nolcd@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 3.0 / 5.0            | 9/13  | 219     |
| gutenye               | 15/15  | 0/15   | 7/7       | 1.5 / 3.0            | 6/6   | 3139    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 5.9 / 8.5            | 15/15 | 204     |
| transformers          | 14/15  | 14/15  | 14/16     | 1.8 / 3.5            | 14/14 | 3740    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `Acme` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Ame`
- transformers: extra box `Search involes`

### u1-1280.firefox@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 4.1 / 6.4            | 9/13  | 183     |
| gutenye               | 15/15  | 0/15   | 7/7       | 4.2 / 8.0            | 6/6   | 1760    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 10.2 / 12.0          | 15/15 | 66      |
| transformers          | 14/15  | 14/15  | 15/16     | 2.1 / 5.1            | 14/14 | 3893    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `Globex` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Global`

### u1-1280.firefox@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 13/15  | 13/15  | 15/15     | 4.1 / 6.4            | 9/13  | 415     |
| gutenye               | 15/15  | 0/15   | 7/7       | 1.6 / 4.9            | 6/6   | 3341    |
| ppu-paddle-ocr        | 15/15  | 15/15  | 16/16     | 6.0 / 8.0            | 15/15 | 163     |
| transformers          | 14/15  | 14/15  | 15/16     | 1.7 / 3.6            | 14/14 | 3864    |

Misses:

- tesseract: `Export` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Create` (16px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- transformers: `INV-001` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `INV-V-001`

## plain-1280

### plain-1280.chromium@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 2/2    | 2/2    | 11/11     | 5.6 / 5.6            | 1/2   | 77      |
| gutenye               | 2/2    | 2/2    | 2/2       | 8.6 / 8.6            | 2/2   | 220     |
| ppu-paddle-ocr        | 2/2    | 2/2    | 2/2       | 12.0 / 12.0          | 2/2   | 68      |
| transformers          | 1/2    | 1/2    | 1/2       | 3.2 / 3.2            | 1/1   | 1563    |

Misses:

- transformers: `No React and no source attributes on this page.` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `No Read and no source attributes on this page.`

### plain-1280.chromium@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 2/2    | 2/2    | 11/11     | 5.6 / 5.6            | 1/2   | 273     |
| gutenye               | 2/2    | 2/2    | 2/2       | 3.1 / 3.1            | 2/2   | 710     |
| ppu-paddle-ocr        | 2/2    | 2/2    | 2/2       | 9.0 / 9.0            | 2/2   | 256     |
| transformers          | 1/2    | 1/2    | 1/2       | 3.2 / 3.2            | 1/1   | 1757    |

Misses:

- transformers: `No React and no source attributes on this page.` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `No Read and no source attributes on this page.`

### plain-1280.chromium@2x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 2/2    | 2/2    | 11/11     | 5.6 / 5.6            | 0/2   | 244     |
| gutenye               | 2/2    | 2/2    | 2/2       | 2.6 / 2.6            | 2/2   | 908     |
| ppu-paddle-ocr        | 2/2    | 2/2    | 2/2       | 9.0 / 9.0            | 2/2   | 236     |
| transformers          | 1/2    | 1/2    | 1/2       | 3.2 / 3.2            | 1/1   | 1664    |

Misses:

- transformers: `No React and no source attributes on this page.` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `No Read and no source attributes on this page.`

### plain-1280.chromium-nolcd@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 2/2    | 2/2    | 11/11     | 5.6 / 5.6            | 1/2   | 283     |
| gutenye               | 2/2    | 2/2    | 2/2       | 8.6 / 8.6            | 2/2   | 703     |
| ppu-paddle-ocr        | 2/2    | 2/2    | 2/2       | 12.0 / 12.0          | 2/2   | 112     |
| transformers          | 1/2    | 1/2    | 1/2       | 3.2 / 3.2            | 1/1   | 1905    |

Misses:

- transformers: `No React and no source attributes on this page.` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `No Read and no source attributes on this page.`

### plain-1280.chromium-nolcd@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 2/2    | 2/2    | 11/11     | 5.6 / 5.6            | 1/2   | 274     |
| gutenye               | 2/2    | 2/2    | 2/2       | 3.1 / 3.1            | 2/2   | 1111    |
| ppu-paddle-ocr        | 2/2    | 2/2    | 2/2       | 9.0 / 9.0            | 2/2   | 241     |
| transformers          | 1/2    | 1/2    | 1/2       | 3.2 / 3.2            | 1/1   | 1945    |

Misses:

- transformers: `No React and no source attributes on this page.` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `No Read and no source attributes on this page.`

### plain-1280.firefox@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 2/2    | 2/2    | 11/11     | 6.1 / 6.1            | 1/2   | 196     |
| gutenye               | 2/2    | 2/2    | 2/2       | 10.0 / 10.0          | 2/2   | 488     |
| ppu-paddle-ocr        | 2/2    | 2/2    | 2/2       | 13.0 / 13.0          | 2/2   | 78      |
| transformers          | 1/2    | 1/2    | 1/2       | 3.4 / 3.4            | 1/1   | 1402    |

Misses:

- transformers: `No React and no source attributes on this page.` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `No Read and no source attributes on this page.`

### plain-1280.firefox@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 2/2    | 2/2    | 11/11     | 6.1 / 6.1            | 1/2   | 292     |
| gutenye               | 2/2    | 2/2    | 2/2       | 4.1 / 4.1            | 2/2   | 1732    |
| ppu-paddle-ocr        | 2/2    | 2/2    | 2/2       | 9.5 / 9.5            | 2/2   | 222     |
| transformers          | 1/2    | 1/2    | 1/2       | 3.4 / 3.4            | 1/1   | 1583    |

Misses:

- transformers: `No React and no source attributes on this page.` (16px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `No Read and no source attributes on this page.`

## small-390

### small-390.chromium@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 4/14   | 4/14   | 10/17     | 3.0 / 3.0            | 3/4   | 66      |
| gutenye               | 11/14  | 0/14   | 4/5       | 2.7 / 5.8            | 4/4   | 515     |
| ppu-paddle-ocr        | 14/14  | 5/14   | 9/9       | 4.2 / 11.1           | 9/9   | 102     |
| transformers          | 14/14  | 7/14   | 10/10     | 1.5 / 2.8            | 10/10 | 2846    |

Misses:

- tesseract: `Last updated 2 min ago` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `2minago`
- tesseract: `Draft` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `ovat`
- tesseract: `Paid` (11px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `GED`
- tesseract: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Invoice #4821` (13px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Overdue` (13px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Sync now` (13px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Help center` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Sign out` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: extra box `Last` conf 23.00
- tesseract: extra box `updated` conf 23.00
- tesseract: extra box `Invoice` conf 92.00
- tesseract: extra box `#4821` conf 89.00
- gutenye: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `Settings Help centerS Sign out` (group expected `Settings Help center Sign out`)
- gutenye: `Help center` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Settings Help centerS Sign out` (group expected `Settings Help center Sign out`)
- gutenye: `Sign out` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Settings Help centerS Sign out` (group expected `Settings Help center Sign out`)

### small-390.chromium@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 10/14  | 10/14  | 22/24     | 2.0 / 4.0            | 6/10  | 141     |
| gutenye               | 9/14   | 0/14   | 3/5       | 4.0 / 4.5            | 0/3   | 815     |
| ppu-paddle-ocr        | 14/14  | 6/14   | 10/10     | 3.7 / 7.1            | 10/10 | 106     |
| transformers          | 14/14  | 5/14   | 9/9       | 1.5 / 2.2            | 9/9   | 4132    |

Misses:

- tesseract: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Overdue` (13px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Sync now` (13px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: extra box `[` conf 35.00
- tesseract: extra box `J` conf 30.00
- gutenye: `Due Oct 31, 2026` (12px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Due 0ct 31.2026 Net30 Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Net 30` (12px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Due 0ct 31.2026 Net30 Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `Due 0ct 31.2026 Net30 Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Total $12,480.00` (14px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Total $12.480.00 incl. tax` (group expected `Total $12,480.00 incl. tax`)
- gutenye: `incl. tax` (14px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Total $12.480.00 incl. tax` (group expected `Total $12,480.00 incl. tax`)

### small-390.chromium@2x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 9/14   | 9/14   | 21/22     | 2.0 / 4.0            | 7/9   | 130     |
| gutenye               | 9/14   | 0/14   | 3/5       | 4.5 / 5.0            | 0/3   | 686     |
| ppu-paddle-ocr        | 13/14  | 5/14   | 9/10      | 3.6 / 9.6            | 9/9   | 94      |
| transformers          | 14/14  | 5/14   | 9/9       | 1.3 / 1.9            | 9/9   | 3607    |

Misses:

- tesseract: `Paid` (11px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `Gp`
- tesseract: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Overdue` (13px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Sync now` (13px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- gutenye: `Total $12,480.00` (14px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Total $12,480.00 )incl. tax` (group expected `Total $12,480.00 incl. tax`)
- gutenye: `incl. tax` (14px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Total $12,480.00 )incl. tax` (group expected `Total $12,480.00 incl. tax`)
- gutenye: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `Settings Help center  S Sign out` (group expected `Settings Help center Sign out`)
- gutenye: `Help center` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Settings Help center  S Sign out` (group expected `Settings Help center Sign out`)
- gutenye: `Sign out` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Settings Help center  S Sign out` (group expected `Settings Help center Sign out`)
- ppu-paddle-ocr: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `) Optional`

### small-390.chromium-nolcd@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 4/14   | 4/14   | 10/17     | 3.0 / 3.0            | 3/4   | 64      |
| gutenye               | 11/14  | 0/14   | 4/5       | 2.7 / 5.8            | 4/4   | 828     |
| ppu-paddle-ocr        | 14/14  | 5/14   | 9/9       | 4.2 / 11.1           | 9/9   | 80      |
| transformers          | 14/14  | 7/14   | 10/10     | 1.5 / 2.8            | 10/10 | 3120    |

Misses:

- tesseract: `Last updated 2 min ago` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `2minago`
- tesseract: `Draft` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `ovat`
- tesseract: `Paid` (11px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `GED`
- tesseract: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Invoice #4821` (13px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Overdue` (13px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Sync now` (13px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Help center` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Sign out` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: extra box `Last` conf 23.00
- tesseract: extra box `updated` conf 23.00
- tesseract: extra box `Invoice` conf 92.00
- tesseract: extra box `#4821` conf 89.00
- gutenye: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `Settings Help centerS Sign out` (group expected `Settings Help center Sign out`)
- gutenye: `Help center` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Settings Help centerS Sign out` (group expected `Settings Help center Sign out`)
- gutenye: `Sign out` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Settings Help centerS Sign out` (group expected `Settings Help center Sign out`)

### small-390.chromium-nolcd@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 10/14  | 10/14  | 22/24     | 2.0 / 4.0            | 6/10  | 138     |
| gutenye               | 9/14   | 0/14   | 3/5       | 4.0 / 4.5            | 0/3   | 1525    |
| ppu-paddle-ocr        | 14/14  | 6/14   | 10/10     | 3.7 / 7.1            | 10/10 | 87      |
| transformers          | 14/14  | 5/14   | 9/9       | 1.5 / 2.2            | 9/9   | 2301    |

Misses:

- tesseract: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Overdue` (13px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Sync now` (13px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: extra box `[` conf 35.00
- tesseract: extra box `J` conf 30.00
- gutenye: `Due Oct 31, 2026` (12px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Due 0ct 31.2026 Net30 Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Net 30` (12px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Due 0ct 31.2026 Net30 Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `Due 0ct 31.2026 Net30 Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Total $12,480.00` (14px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Total $12.480.00 incl. tax` (group expected `Total $12,480.00 incl. tax`)
- gutenye: `incl. tax` (14px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Total $12.480.00 incl. tax` (group expected `Total $12,480.00 incl. tax`)

### small-390.firefox@1x.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 4/14   | 4/14   | 10/17     | 2.6 / 3.4            | 3/4   | 57      |
| gutenye               | 12/14  | 0/14   | 4/5       | 2.7 / 5.9            | 4/4   | 1588    |
| ppu-paddle-ocr        | 14/14  | 5/14   | 9/9       | 4.7 / 12.2           | 9/9   | 67      |
| transformers          | 14/14  | 7/14   | 10/10     | 2.0 / 2.9            | 10/10 | 2977    |

Misses:

- tesseract: `Last updated 2 min ago` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `2minago`
- tesseract: `Draft` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Oat`
- tesseract: `Paid` (11px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `GED`
- tesseract: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Invoice #4821` (13px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Overdue` (13px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Sync now` (13px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Help center` (11px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Sign out` (11px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: extra box `Last` conf 28.00
- tesseract: extra box `updated` conf 28.00
- tesseract: extra box `Invoice` conf 92.00
- tesseract: extra box `#4821` conf 89.00
- gutenye: `Total $12,480.00` (14px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Total$12,480.00 0incl.tax` (group expected `Total $12,480.00 incl. tax`)
- gutenye: `incl. tax` (14px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Total$12,480.00 0incl.tax` (group expected `Total $12,480.00 incl. tax`)

### small-390.firefox@1x-up2.png

| engine (best setting) | recall | strict | precision | box err median / max | spans | warm ms |
| --------------------- | ------ | ------ | --------- | -------------------- | ----- | ------- |
| tesseract             | 10/14  | 10/14  | 22/24     | 2.6 / 4.2            | 5/10  | 113     |
| gutenye               | 9/14   | 0/14   | 3/5       | 4.0 / 4.5            | 0/3   | 1654    |
| ppu-paddle-ocr        | 14/14  | 5/14   | 9/9       | 3.2 / 5.7            | 9/9   | 97      |
| transformers          | 14/14  | 5/14   | 9/9       | 1.7 / 2.5            | 9/9   | 2681    |

Misses:

- tesseract: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `(nothing)`
- tesseract: `Overdue` (13px, rgb(255, 255, 255) on rgb(66, 107, 242)) read as `(nothing)`
- tesseract: `Sync now` (13px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: `Settings` (11px, rgb(229, 231, 235) on rgb(31, 41, 51)) read as `(nothing)`
- tesseract: extra box `[` conf 49.00
- tesseract: extra box `}` conf 55.00
- gutenye: `Due Oct 31, 2026` (12px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Due 0ct 31,2026 Net30Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Net 30` (12px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Due 0ct 31,2026 Net30Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Optional` (12px, rgb(184, 192, 204) on rgb(255, 255, 255)) read as `Due 0ct 31,2026 Net30Optional` (group expected `Due Oct 31, 2026 Net 30 Optional`)
- gutenye: `Total $12,480.00` (14px, rgb(31, 41, 51) on rgb(255, 255, 255)) read as `Total $12.480.00 incl. tax` (group expected `Total $12,480.00 incl. tax`)
- gutenye: `incl. tax` (14px, rgb(138, 148, 166) on rgb(255, 255, 255)) read as `Total $12.480.00 incl. tax` (group expected `Total $12,480.00 incl. tax`)

## 1x upscaled 2x vs native 2x (Chromium, best setting)

| engine         | page       | @1x               | @1x-up2           | @2x native        |
| -------------- | ---------- | ----------------- | ----------------- | ----------------- |
| tesseract      | u1-390     | 13/15, prec 15/15 | 13/15, prec 15/15 | 13/15, prec 15/15 |
| tesseract      | u1-1280    | 13/15, prec 15/15 | 13/15, prec 15/15 | 13/15, prec 15/15 |
| tesseract      | plain-1280 | 2/2, prec 11/11   | 2/2, prec 11/11   | 2/2, prec 11/11   |
| tesseract      | small-390  | 4/14, prec 10/17  | 10/14, prec 22/24 | 9/14, prec 21/22  |
| gutenye        | u1-390     | 15/15, prec 7/7   | 15/15, prec 7/7   | 15/15, prec 7/7   |
| gutenye        | u1-1280    | 15/15, prec 7/7   | 15/15, prec 7/7   | 15/15, prec 7/7   |
| gutenye        | plain-1280 | 2/2, prec 2/2     | 2/2, prec 2/2     | 2/2, prec 2/2     |
| gutenye        | small-390  | 11/14, prec 4/5   | 9/14, prec 3/5    | 9/14, prec 3/5    |
| ppu-paddle-ocr | u1-390     | 15/15, prec 16/16 | 15/15, prec 16/16 | 15/15, prec 16/16 |
| ppu-paddle-ocr | u1-1280    | 15/15, prec 16/16 | 15/15, prec 16/16 | 15/15, prec 16/16 |
| ppu-paddle-ocr | plain-1280 | 2/2, prec 2/2     | 2/2, prec 2/2     | 2/2, prec 2/2     |
| ppu-paddle-ocr | small-390  | 14/14, prec 9/9   | 14/14, prec 10/10 | 13/14, prec 9/10  |
| transformers   | u1-390     | 13/15, prec 14/16 | 13/15, prec 14/16 | 13/15, prec 14/16 |
| transformers   | u1-1280    | 15/15, prec 16/16 | 14/15, prec 14/16 | 13/15, prec 13/16 |
| transformers   | plain-1280 | 1/2, prec 1/2     | 1/2, prec 1/2     | 1/2, prec 1/2     |
| transformers   | small-390  | 14/14, prec 10/10 | 14/14, prec 9/9   | 14/14, prec 9/9   |

## Confidence: does it separate right from wrong reads?

Per OCR box, over all 28 PNGs. "right" = box in a matched group. Florence-2 returns no scores.

| engine / setting                            | right boxes | wrong boxes | right: min / p10 / median | wrong: median / p90 / max | wrong boxes at or above the right-box p10 |
| ------------------------------------------- | ----------- | ----------- | ------------------------- | ------------------------- | ----------------------------------------- |
| gutenye ppocrv4-default                     | 136         | 11          | 0.95 / 0.98 / 1.00        | 0.97 / 0.98 / 0.98        | 0/11                                      |
| ppu-paddle-ocr v5-en-mobile-per-box         | 287         | 40          | 0.42 / 0.91 / 1.00        | 0.41 / 0.97 / 1.00        | 5/40                                      |
| ppu-paddle-ocr v5-en-mobile-per-line        | 230         | 77          | 0.39 / 0.73 / 0.98        | 0.57 / 0.95 / 0.98        | 21/77                                     |
| ppu-paddle-ocr v6-small-per-box             | 267         | 67          | 0.92 / 0.99 / 1.00        | 0.67 / 1.00 / 1.00        | 18/67                                     |
| ppu-paddle-ocr v6-small-per-line            | 253         | 71          | 0.94 / 0.96 / 0.98        | 0.71 / 0.98 / 1.00        | 18/71                                     |
| ppu-paddle-ocr v6-tiny-per-box              | 303         | 1           | 0.88 / 0.96 / 1.00        | 0.95 / 0.95 / 0.95        | 0/1                                       |
| ppu-paddle-ocr v6-tiny-per-box-native-timed | 303         | 1           | 0.88 / 0.96 / 1.00        | 0.95 / 0.95 / 0.95        | 0/1                                       |
| ppu-paddle-ocr v6-tiny-per-box-pad0         | 303         | 1           | 0.88 / 0.96 / 1.00        | 0.95 / 0.95 / 0.95        | 0/1                                       |
| ppu-paddle-ocr v6-tiny-per-box-pad0.2       | 284         | 20          | 0.90 / 0.97 / 1.00        | 0.96 / 1.00 / 1.00        | 9/20                                      |
| ppu-paddle-ocr v6-tiny-per-box-trim         | 303         | 1           | 0.88 / 0.96 / 1.00        | 0.95 / 0.95 / 0.95        | 0/1                                       |
| ppu-paddle-ocr v6-tiny-per-box-wasm-t0      | 303         | 1           | 0.88 / 0.96 / 1.00        | 0.95 / 0.95 / 0.95        | 0/1                                       |
| ppu-paddle-ocr v6-tiny-per-box-wasm-t1      | 303         | 1           | 0.88 / 0.96 / 1.00        | 0.95 / 0.95 / 0.95        | 0/1                                       |
| ppu-paddle-ocr v6-tiny-per-box-wasm-t4      | 303         | 1           | 0.88 / 0.96 / 1.00        | 0.95 / 0.95 / 0.95        | 0/1                                       |
| ppu-paddle-ocr v6-tiny-per-line             | 303         | 5           | 0.92 / 0.96 / 0.98        | 0.94 / 0.95 / 0.95        | 0/5                                       |
| tesseract best_int-psm11                    | 399         | 34          | 0.00 / 88.00 / 96.00      | 69.00 / 95.00 / 96.00     | 6/34                                      |
| tesseract best_int-psm3                     | 393         | 56          | 24.00 / 87.00 / 96.00     | 42.00 / 93.00 / 96.00     | 11/56                                     |
| tesseract best_int-psm6                     | 394         | 44          | 24.00 / 85.00 / 95.00     | 61.00 / 92.00 / 96.00     | 11/44                                     |
| tesseract fast-psm11                        | 404         | 28          | 0.00 / 83.00 / 95.00      | 55.00 / 92.00 / 92.00     | 8/28                                      |
| tesseract fast-psm3                         | 396         | 52          | 0.00 / 78.00 / 95.00      | 49.00 / 92.00 / 95.00     | 14/52                                     |
| tesseract fast-psm6                         | 403         | 34          | 0.00 / 78.00 / 95.00      | 49.00 / 91.00 / 92.00     | 10/34                                     |

## u1-390, all seven renders together (best setting per engine)

| engine (setting)                                        | recall         | strict recall                    | precision      | warm ms per image |
| ------------------------------------------------------- | -------------- | -------------------------------- | -------------- | ----------------- |
| ppu-paddle-ocr (PP-OCRv6 tiny, per-box)                 | 105/105 (100%) | 105/105                          | 112/112 (100%) | 55 to 146         |
| gutenye (PP-OCRv4 ch, bundled)                          | 105/105 (100%) | 0/105 (line boxes span two runs) | 49/49 (100%)   | 692 to 1322       |
| tesseract.js (fast eng, PSM 11)                         | 91/105 (86.7%) | 91/105                           | 105/105 (100%) | 105 to 273        |
| transformers.js (Florence-2-base fp32, OCR_WITH_REGION) | 92/105 (87.6%) | 92/105                           | 99/112 (88.4%) | 3250 to 5863      |

Every tesseract miss on u1-390 is `Export` / `Create`: white 16px text on the #426bf2 buttons, in all 7 renders, all 6 tesseract settings, also on a cropped button and on the inverted image (`engines/tesseract/probe.ts`, `probe2.ts`). Florence-2 misses are hallucinated characters on clear 16 to 24px text: `7000` read as `70000` or `700`, `INV-002` as `INV_002`.

## Footprint and runtime

| engine                                                | node_modules (pnpm, this Mac)                                            | native code                       | model files                                                                                         | network at runtime                                                                                                                                                                                                    | platforms                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| tesseract.js 7.0.0                                    | 50 MB (tesseract.js-core wasm 43 MB)                                     | none (wasm)                       | eng traineddata: fast 4.1 MB, best_int 5.2 MB                                                       | yes by default: fetches `cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int` and caches `eng.traineddata` in the cwd. Avoided here with a local `langPath` + `cacheMethod: 'none'`                            | any Node                                                                                                      |
| @gutenye/ocr-node 1.4.9                               | 340 MB (onnxruntime-node 293 MB, sharp 15 MB, opencv-js 12 MB)           | onnxruntime-node 1.31.1, sharp    | PP-OCRv4 ch det+rec+cls bundled in `@gutenye/ocr-models` (15 MB)                                    | no                                                                                                                                                                                                                    | onnxruntime-node ships darwin-arm64, linux-x64, linux-arm64, win32-x64, win32-arm64 binaries; ran on this Mac |
| ppu-paddle-ocr 6.6.1 (+ onnxruntime-node 1.31.1 peer) | 341 MB (onnxruntime-node 293 MB, @napi-rs/canvas 28 MB, opencv-js 15 MB) | onnxruntime-node, @napi-rs/canvas | PP-OCRv6 tiny det 1.9 MB + rec 4.5 MB + dict 27 KB (v6-small 31 MB, v5-en-mobile 12.9 MB)           | yes by default: `huggingface.co/snowfluke/ppu-paddle-ocr-models` into `~/.cache/ppu-paddle-ocr` (GitHub mirror via `PPU_PADDLE_OCR_MODEL_MIRROR`). Avoided here by passing the model files as buffers (`models/ppu/`) | ran on this Mac and in `node:22-slim --platform linux/amd64` (Docker, emulated), same reads on u1-390         |
| @huggingface/transformers 4.3.2                       | 471 MB (onnxruntime-node 287 MB, onnxruntime-web 139 MB, sharp 17 MB)    | onnxruntime-node, sharp           | Florence-2-base-ft from `huggingface.co/onnx-community/Florence-2-base-ft`: q8 263 MB, fp32 1.08 GB | yes: hub download on first use (cached under `env.cacheDir`, here `models/hf`)                                                                                                                                        | onnxruntime-node platforms as above                                                                           |

First run on this Mac, models already on disk: ppu v6-tiny 89 to 211 ms (create + first image), tesseract 350 to 1100 ms, gutenye 1.1 s, Florence-2 fp32 about 1.5 s load + 3.4 s first image (the 19 s in the table above includes the 1 GB download).

onnxruntime-node notes (apply to gutenye, ppu-paddle-ocr and transformers.js):

- On linux-x64, `npm install` runs onnxruntime-node's postinstall, which downloads the CUDA and TensorRT providers: node_modules was 620 MB in the container, `bin/napi-v6/linux/x64` 318 MB. `ONNXRUNTIME_NODE_INSTALL=skip` (or `--onnxruntime-node-install=skip`) prevents it. pnpm blocks the script by default.
- onnxruntime 1.31 native code writes a telemetry device id and database to `~/Library/Application Support/Microsoft/DeveloperTools/.onnxruntime/` on macOS (created by the first gutenye run of this spike, still there), and in the Linux container logged `telemetry_1ds.cc ... No readable CA bundle was found; telemetry HTTPS uploads will be unavailable`, so it attempts uploads when it can. Not investigated how to switch it off.

## Answers

**Upscaled 1x vs native 2x.** For PaddleOCR (ppu v6-tiny) native 2x buys nothing in text: u1-390, u1-1280 and plain read 100% at 1x, 1x-up2 and 2x alike; on small-390 1x and 1x-up2 read 14/14 and native 2x read 13/14 (`Optional` read as `) Optional`). It only buys box precision: median box error 7.6 px at 1x vs 5.2 px at 1x-up2 or 2x on u1-390, and the trim step below removes that difference. Tesseract does need the upscale (small-390 4/14 at 1x, 10/14 at 1x-up2, 9/14 at native 2x). Florence-2 resizes to 768 px internally, so scale is irrelevant to it. Designers do not need to export at 2x; 1x is enough for PaddleOCR, and the 2x nearest upscale is equivalent to a native 2x for every engine measured. The cross-renderer targets (Chromium without LCD text and subpixel positioning, Firefox) read the same as plain Chromium for PaddleOCR on every page.

**Confidence.** tesseract.js (0 to 100 per word), gutenye (0 to 1 per line) and ppu-paddle-ocr (0 to 1 per box) return it; Florence-2 does not. It does not separate right from wrong reads on these images: see the confidence table. With ppu v6-tiny there is one wrong box in 304 (`) Optional`, 0.95) against right boxes from 0.88 to 1.00, so no floor removes it without also removing right reads. On the weaker models the wrong reads cluster low (v5-en-mobile median 0.41) but 5 to 21 of them still sit above the 10th percentile of the right reads. Tesseract's worst failures are boxes that are simply absent (`Export`, `Create`), which no confidence floor can report. Conclusion: no OCR confidence floor constant is needed or useful; the text matcher should treat every OCR box at face value.

**Box geometry.** PaddleOCR boxes are padded around the glyphs (ppu defaults `paddingVertical 0.4`, `paddingHorizontal 0.6` of the box height), giving 6 px median edge error. Shrinking the padding to 0.2 hurts recognition (recall 99.7% to 90.7%); `0` is ignored by the library (falsy, falls back to the default; identical output). Recognising with the default padding and then trimming each box to its ink with `sharp(...).trim({threshold: 40})` (`trim.ts`) keeps recall and precision unchanged and brings the error to 3.0 px median, 8.2 max, the same as tesseract's word boxes; what remains is the DOM line box's leading above and below the glyphs. One PaddleOCR box often spans two adjacent DOM runs on one line (`Help center Sign out`, `Total $12,480.00 incl. tax`), so the text matcher must match groups (runs and OCR boxes connected by overlap, strings compared after joining in reading order), not one run to one box. Strict 1:1 recall for ppu is 81.1% over all PNGs but 100% on u1-390.

**Florence-2 (transformers.js).** The only detection plus recognition pipeline found that runs in transformers.js in Node without Python is Florence-2 with the `<OCR_WITH_REGION>` task (TrOCR there is recognition only and needs a detector). Smallest model: Florence-2-base (0.23B). It reads 11px text and white-on-blue labels, but it is generative and invents characters on clear text (`7000` as `70000`), which would surface as false `text` deltas; q8 is worse than fp32 (84.2% vs 91.9% recall); tiling into 768 px crops is worse again (79.9%, partial words at tile seams). 2 to 6 s per image and 263 MB to 1 GB of model download.

**Not measured.** `ocrs` has no npm package or Node bindings (404 for `ocrs`, `@ocrs/ocrs`, `ocrs-wasm`); it would need a Rust/wasm build of our own, so it was not the extra candidate. `ppu-paddle-ocr` (PaddleOCR v5/v6 models, maintained, updated 2026-10-08) was taken as the extra candidate instead. tesseract `tessdata_best` (float) models abort the tesseract.js 7 wasm core (`missing function: _ZN9tesseract13DotProductSSEEPKfS1_i`); only `fast` and `best_int` run. A local-contrast "ink map" preprocessing for tesseract (`engines/tesseract/probe3.ts`) destroyed the reads and was dropped. ppu-paddle-ocr's onnxruntime-web (wasm) path in Node, which would remove the native binary, was not tried.

## Recommendation

Use `ppu-paddle-ocr` with the PP-OCRv6 tiny models, `strategy: 'per-box'`, model files shipped with the package and passed as buffers (no runtime download), boxes trimmed to ink afterwards. It is the only candidate with no misses on the hardest fixture page in all seven renders (u1-390: 105/105 recall, 112/112 precision; tesseract 91/105, Florence-2 92/105), reads 11px and light-on-dark text, and is the fastest (about 0.1 s per image warm). Its cost is the onnxruntime-node native dependency (about 290 MB unpacked across all platforms, CUDA download on linux-x64 unless skipped, and onnxruntime's telemetry), which the spec should accept explicitly instead of the tesseract-first plan: tesseract cannot read text on filled buttons, the exact case of the `text-changed` fixture variant.

## Follow-up: ppu-paddle-ocr on onnxruntime-web (wasm) in Node

Scripts: `engines/ppu-wasm/wasm-service.ts` (the service), `engines/ppu-wasm/run.ts` (timing and accuracy on the 28 PNGs), `engines/ppu-wasm/linux-check.ts` (container check), `engines/ppu/timed.ts` (the native route measured the same way). Raw output: `raw/ppu-paddle-ocr/v6-tiny-per-box-wasm-t{1,4,0}.json` and `v6-tiny-per-box-native-timed.json`.

**Does ppu-paddle-ocr support wasm in Node?** Not through a published entry point. `ppu-paddle-ocr` (Node entry) imports `onnxruntime-node` at module level (`processor/paddle-ocr.service.js`, `processor/platform.node.js`, and through them `processor/detection.service.js` and `recognition.service.js`). `ppu-paddle-ocr/web` uses `onnxruntime-web` but gets its canvas from `ppu-ocv/canvas-web`, which needs `OffscreenCanvas` or `document`; Node has neither. The package `exports` expose only `.`, `./web` and `./mobile`. Its core is written to be platform-injected, though: `BasePaddleOcrService`, `BaseDetectionService` and `BaseRecognitionService` take a `PlatformProvider` whose `ort` field is the ONNX Runtime namespace (`core/platform.d.ts`). `wasm-service.ts` (45 lines) imports those three core classes, `createSessionWithFallback` and `parseDictionary` by file path, and supplies a Node provider copied from ppu's `NodePlatformProvider` with `ort` taken from `onnxruntime-web` instead of `onnxruntime-node`. All of ppu's pre and post processing is reused unchanged: the `ppu-ocv` canvas (`@napi-rs/canvas`), OpenCV-wasm DB box extraction, CTC decoding and line grouping. Execution provider `wasm`, `ort.env.wasm.numThreads` set per run. The cost is reaching into files the package does not export, so a ppu release can break it. A product version should either ask upstream for a Node-wasm entry or vendor these ~45 lines and pin the version.

### Recall and precision, native vs wasm (PP-OCRv6 tiny, per-box)

| render                          | native recall | native precision | wasm 1 thread recall | wasm 1 thread precision | wasm 4 threads recall | wasm 4 threads precision |
| ------------------------------- | ------------- | ---------------- | -------------------- | ----------------------- | --------------------- | ------------------------ |
| u1-390.chromium@1x              | 15/15         | 16/16            | 15/15                | 16/16                   | 15/15                 | 16/16                    |
| u1-390.chromium@1x-up2          | 15/15         | 16/16            | 15/15                | 16/16                   | 15/15                 | 16/16                    |
| u1-390.chromium@2x              | 15/15         | 16/16            | 15/15                | 16/16                   | 15/15                 | 16/16                    |
| u1-390.chromium-nolcd@1x        | 15/15         | 16/16            | 15/15                | 16/16                   | 15/15                 | 16/16                    |
| u1-390.chromium-nolcd@1x-up2    | 15/15         | 16/16            | 15/15                | 16/16                   | 15/15                 | 16/16                    |
| u1-390.firefox@1x               | 15/15         | 16/16            | 15/15                | 16/16                   | 15/15                 | 16/16                    |
| u1-390.firefox@1x-up2           | 15/15         | 16/16            | 15/15                | 16/16                   | 15/15                 | 16/16                    |
| small-390.chromium@1x           | 14/14         | 9/9              | 14/14                | 9/9                     | 14/14                 | 9/9                      |
| small-390.chromium@1x-up2       | 14/14         | 10/10            | 14/14                | 10/10                   | 14/14                 | 10/10                    |
| small-390.chromium@2x           | 13/14         | 9/10             | 13/14                | 9/10                    | 13/14                 | 9/10                     |
| small-390.chromium-nolcd@1x     | 14/14         | 9/9              | 14/14                | 9/9                     | 14/14                 | 9/9                      |
| small-390.chromium-nolcd@1x-up2 | 14/14         | 10/10            | 14/14                | 10/10                   | 14/14                 | 10/10                    |
| small-390.firefox@1x            | 14/14         | 9/9              | 14/14                | 9/9                     | 14/14                 | 9/9                      |
| small-390.firefox@1x-up2        | 14/14         | 9/9              | 14/14                | 9/9                     | 14/14                 | 9/9                      |

Output is identical, not just equally scored: the native and wasm (1 thread) runs produce the same strings and the same boxes (rounded to 1 px) on 28 of 28 PNGs. Over all 28 PNGs native and wasm both get 321/322 recall and 303/304 precision. The one miss is the same in both (`Optional` read as `) Optional` on `small-390.chromium@2x`).

### Time per image on this Mac (PP-OCRv6 tiny, per-box, 28 PNGs)

The machine was under heavy load from other work during these runs (load average 15 to 47 on 12 cores), so each route was run 4 to 5 times. Each cell gives the best run, then the median, then the range of run medians. Warm = median `recognize` over the 28 PNGs on a loaded engine (second pass). First image = the first `recognize` after `initialize`. Process cold = node start, imports, session creation and the first image.

| route                                    | warm ms per image: best / median (range) | first image ms: best / median | process cold to first result ms: best / median |
| ---------------------------------------- | ---------------------------------------- | ----------------------------- | ---------------------------------------------- |
| native (onnxruntime-node 1.31.1, CPU EP) | 80 / 110 (80 to 274)                     | 86 / 154                      | 549 / 1196                                     |
| wasm, 1 thread                           | 292 / 328 (292 to 455)                   | 227 / 346                     | 949 / 1717                                     |
| wasm, 4 threads                          | 121 / 196 (121 to 319)                   | 165 / 235                     | 747 / 1186                                     |
| wasm, threads auto (`numThreads: 0`)     | 102 / 265 (102 to 324)                   | 169 / 226                     | 730 / 1132                                     |

Single-threaded wasm is about 3.5x slower than native when warm (best 292 ms vs 80 ms), and about 0.3 s per image either way. That is far below anything a once-at-registration OCR step would notice. Threads do work in Node: onnxruntime-web uses `worker_threads` there, and `SharedArrayBuffer` is always available in Node, so the browser concern about cross-origin isolation does not apply to a server-side Node package. With 4 threads or auto, wasm is within noise of native.

### Install footprint of the wasm route alone

|                    | this Mac (pnpm)                                                                 | linux-x64 container (npm)                               |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| node_modules       | 197 MB                                                                          | 205 MB                                                  |
| largest parts      | onnxruntime-web 145 MB, @napi-rs/canvas 28 MB, opencv-js 15 MB, protobufjs 3 MB | onnxruntime-web 145 MB, @napi-rs 36 MB, opencv-js 15 MB |
| native binary left | `@napi-rs/canvas` (Skia, `skia.darwin-arm64.node`)                              | `@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node` |

- onnxruntime-web ships four wasm builds plus browser bundles (147 MB `dist`). The Node build (`dist/ort.node.min.mjs`) loads only `ort-wasm-simd-threaded.mjs` and `ort-wasm-simd-threaded.wasm` (14.8 MB). A bundled product build would therefore carry about 15 MB of runtime, not 145 MB.
- The remaining native code is `@napi-rs/canvas`, used by `ppu-ocv` for PNG decode, resize and crop. It is a prebuilt per-platform optional dependency: darwin x64/arm64, linux x64/arm64 gnu and musl, win32 x64/arm64, and more. It has no postinstall, no download and no telemetry. Removing it would need a pure-JS canvas shim behind `ppu-ocv`'s `setPlatform`. `@napi-rs/canvas` has no wasm build on npm (`@napi-rs/canvas-wasm32-wasi` is 404).
- Runtime downloads: none. The run passes in `node:22-slim` with `--network none`, after installing in a separate step. The model files are passed as buffers, and onnxruntime-web in Node loads its wasm from its own `dist`; ppu's CDN `wasmPaths` default only applies in a browser.
- Telemetry: none. A wasm run with `HOME` pointed at an empty scratch folder left it empty. A native run on the same setup created `Library/Application Support/Microsoft/DeveloperTools/.onnxruntime/{deviceid,onnxruntime.db}`.

### Turning off telemetry on the native route

onnxruntime-node has no JS API for this. The native library reads the environment variable `ORT_DISABLE_TELEMETRY` (string present in `libonnxruntime.1.31.1.dylib`; the other ORT_ variables there are unrelated). Verified on this Mac with `HOME` pointed at empty scratch folders:

- without the variable, the native run creates `~/Library/Application Support/Microsoft/DeveloperTools/.onnxruntime/` with `deviceid` and `onnxruntime.db`;
- with `ORT_DISABLE_TELEMETRY=1`, nothing is written.

On linux-x64 (container), without the variable it writes `~/.cache/Microsoft/DeveloperTools/.onnxruntime/{deviceid,onnxruntime.db}` and logs `telemetry_1ds.cc ... telemetry HTTPS uploads will be unavailable`. With `ORT_DISABLE_TELEMETRY=1`, neither the files nor the log line appear. A library can only set this through `process.env` before onnxruntime-node is loaded, which also affects any other onnxruntime user in the process. Also on linux-x64: `ONNXRUNTIME_NODE_INSTALL=skip` brings the native route's node_modules from 620 MB down to 348 MB.

### Linux x64

The wasm route runs in `node:22-slim --platform linux/amd64` (emulated on this Mac, so its timings are meaningless). It reads u1-390 (both renders tried) and small-390 identically to the Mac, including offline with `--network none`.

### Recommendation for the follow-up

Take the wasm route: `ppu-paddle-ocr` core plus `onnxruntime-web`, models shipped as files, 1 thread by default. The text it reads is identical to the native route on all 28 PNGs. It drops the 290 MB multi-platform onnxruntime-node binary, its CUDA postinstall and its telemetry. It costs about 0.3 s per image single-threaded, or near native speed with threads. What is left is about 15 MB of wasm runtime (once bundled), the `@napi-rs/canvas` prebuilt, and the ppu internals imported by path, which need a version pin or upstream support.
--------------------------------------------------------------------------------

## Ported source 1: `engines/ppu-wasm/wasm-service.ts`

Constructs `ppu-paddle-ocr` 6.6.1's core services on `onnxruntime-web` 1.31.1 under Node. The package exports `.`, `./web`, `./mobile` and `./coi-serviceworker.js` only; `.` imports `onnxruntime-node`, so the core files are imported by file URL.

```ts
import {readFile} from 'node:fs/promises'
import * as ort from 'onnxruntime-web'
import {Canvas, Contours, cv, ImageProcessor} from 'ppu-ocv'
import {CanvasProcessor, CanvasToolkit} from 'ppu-ocv/canvas'

const PPU = new URL('./node_modules/ppu-paddle-ocr/', import.meta.url).href
const {BasePaddleOcrService} = await import(`${PPU}core/base-paddle-ocr.service.js`)
const {BaseDetectionService} = await import(`${PPU}core/base-detection.service.js`)
const {BaseRecognitionService} = await import(`${PPU}core/base-recognition.service.js`)
const {createSessionWithFallback} = await import(`${PPU}core/session-factory.js`)
const {parseDictionary} = await import(`${PPU}utils.js`)

function createWasmPlatform() {
  return {
    pathSeparator: '/',
    ort,
    createCanvas: (width: number, height: number) => new Canvas(width, height),
    isCanvas: (image: unknown) => image instanceof Canvas,
    loadResource: async (source: string | ArrayBuffer | undefined, defaultUrl: string) => {
      if (source instanceof ArrayBuffer) return source
      const bytes = await readFile(source ?? defaultUrl)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
    saveDebugImage: async () => undefined,
    canvas: {
      prepareCanvas: (image: unknown) => CanvasProcessor.prepareCanvas(image),
      createProcessor: (canvas: unknown) => new CanvasProcessor(canvas),
      getToolkit: () => CanvasToolkit.getInstance(),
    },
    imageProcessor: {
      prepareCanvas: async (image: unknown) => CanvasProcessor.prepareCanvas(image),
      ImageProcessor,
      Contours,
      cv,
    },
  }
}

export type WasmModels = {detection: ArrayBuffer; recognition: ArrayBuffer; charactersDictionary: ArrayBuffer}

export async function createWasmOcr(input: {
  models: WasmModels
  threads: number
  recognition: Record<string, unknown>
}) {
  ort.env.wasm.numThreads = input.threads
  const platform = createWasmPlatform()
  const service = new BasePaddleOcrService(platform, {
    recognition: input.recognition,
    session: {executionProviders: ['wasm'], graphOptimizationLevel: 'all'},
  })
  const session = (model: ArrayBuffer) =>
    createSessionWithFallback(
      ort,
      new Uint8Array(model),
      service.options.session,
      () => undefined,
      () => undefined,
    )
  const [detection, recognition] = await Promise.all([
    session(input.models.detection),
    session(input.models.recognition),
    ImageProcessor.initRuntime(),
  ])
  service.detectionSession = detection
  service.recognitionSession = recognition
  service.options.recognition.charactersDictionary = parseDictionary(input.models.charactersDictionary)
  service.detector = new BaseDetectionService(
    platform,
    detection,
    service.options.detection,
    service.options.debugging,
    'opencv',
  )
  service.recognitor = new BaseRecognitionService(
    platform,
    recognition,
    service.options.recognition,
    service.options.debugging,
    'opencv',
  )
  return service
}
```

## Ported source 2: `trim.ts`

Shrinks each OCR box to its ink (`sharp.trim({threshold: 40})` inside the box). The design re-implements the same rule on the package's own `Raster` without sharp.

```ts
import {readFile} from 'node:fs/promises'
import sharp from 'sharp'
import {saveRun, SPIKE, TARGETS, type Recognition, type Unit} from './common.ts'

const SOURCE = process.argv[2] ?? 'v6-tiny-per-box'
const run: {firstRunMs: number; recognitions: Recognition[]} = JSON.parse(
  await readFile(`${SPIKE}raw/ppu-paddle-ocr/${SOURCE}.json`, 'utf8'),
)

async function tighten(file: string, unit: Unit): Promise<Unit> {
  const meta = await sharp(file).metadata()
  const left = Math.max(0, Math.floor(unit.box.x))
  const top = Math.max(0, Math.floor(unit.box.y))
  const width = Math.min((meta.width ?? 0) - left, Math.ceil(unit.box.width))
  const height = Math.min((meta.height ?? 0) - top, Math.ceil(unit.box.height))
  if (width < 2 || height < 2) return unit
  const crop = await sharp(file).extract({left, top, width, height}).png().toBuffer()
  const {info} = await sharp(crop).trim({threshold: 40}).toBuffer({resolveWithObject: true})
  return {
    ...unit,
    box: {
      x: left - (info.trimOffsetLeft ?? 0),
      y: top - (info.trimOffsetTop ?? 0),
      width: info.width,
      height: info.height,
    },
  }
}

const recognitions = []
for (const recognition of run.recognitions) {
  const begin = performance.now()
  const units = await Promise.all(recognition.units.map((unit) => tighten(`${TARGETS}${recognition.image}.png`, unit)))
  recognitions.push({image: recognition.image, units, ms: recognition.ms + performance.now() - begin})
}
await saveRun({
  engine: 'ppu-paddle-ocr',
  setting: `${SOURCE}-trim`,
  recognitions,
  firstRunMs: run.firstRunMs,
  notes: {postprocess: 'sharp trim threshold 40 inside each OCR box'},
})
```
