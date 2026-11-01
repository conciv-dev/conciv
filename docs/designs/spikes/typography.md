# Font size calibration spike (design driver, estimates enricher)

Setup: Playwright 1.64.1, Chromium and Firefox, device scale 1, macOS (Darwin 25.6). Ink is trimmed with the same rule as
`trimToInk` in `comparators/paddle.ts`: background = the box's top-left pixel, ink = any channel off by more than 40
(`inkTrimThreshold`). Web fonts (Inter, Roboto, Nunito) load from Google Fonts with `display=block`, and each was checked
with `document.fonts.check`. The fixture host's font is `Arial, sans-serif` (styles.css), so Arial stands for the fixture font.
Strings: sentence = "Export the quarterly report", caps = "EXPORT", digits = "1,240.00".

## Verdict

**FAIL as the design doc words it. A fixed ratio does not predict font size within 1 px, and neither does a ratio per font.**

- One ratio for every font and string: best 1.055, max error 6.67 px, 40% of cases within 1 px.
- One ratio per font: max 9.62 px, 52% within 1 px. Ink height depends on the characters in the string more than on
  the font. Cap height is about 0.76 em, the ascender-to-descender span about 0.97 em, and a comma adds about 0.1 em.
- One ratio per font and string kind (kind read from the OCR text): max 1.61 px, 97% within 1 px. This is close but still a fail.
  The misses come from pixel quantisation (one ink row is about 1.3 px of font size for caps) and from overshoot.
- **Live calibration on the fixture target: 16/16 runs within 1 px, max error 0.00 px.** This pass is trivial: every target
  string is also on the live page, and on macOS Chromium and Firefox give the same ink height for the same string
  (0 of 210 grid cases differ). With leave-one-out, where the page-wide median ratio stands in for the run's own text,
  only 11/16 runs are within 1 px (max 4.0 px). The fallback the design doc plans for unmatched runs therefore fails.
- **The estimator that passes is render search.** Render the run's OCR text in the live page's font, in the run's sampled
  foreground and background colours, at every integer size from 8 to 56 px. Pick the sizes whose trimmed ink height equals
  the target's ink height and take the middle of that range. It came within 0.5 px in every case: 210/210 grid cases
  (Firefox targets against Chromium renders) and 16/16 fixture runs. Colour polarity is part of the rule. "Create" (white on
  #426bf2) is 2 ink rows taller than the same text dark on white, because macOS renders light-on-dark text bolder.
  Rendered dark on white, its estimate was off by 2.5 px; rendered in its own colours, 0.5 px.

## Ratio fits and error distributions (questions 1 and 2)

### Chromium, fitted and tested on Chromium

#### One ratio for every font and string

| ratio key | ratio | n   | max abs err | mean abs err | p90  | within 1 px |
| --------- | ----- | --- | ----------- | ------------ | ---- | ----------- |
| all       | 1.055 | 210 | 6.67        | 1.90         | 4.28 | 40%         |
| **all**   |       | 210 | 6.67        | 1.90         | 4.28 | 40%         |

#### One ratio per font (string kind unknown)

| ratio key      | ratio | n   | max abs err | mean abs err | p90  | within 1 px |
| -------------- | ----- | --- | ----------- | ------------ | ---- | ----------- |
| system-ui      | 1.083 | 30  | 4.93        | 1.38         | 3.42 | 53%         |
| Inter          | 1.055 | 30  | 5.61        | 1.53         | 4.78 | 67%         |
| Roboto         | 1.031 | 30  | 6.35        | 2.11         | 5.44 | 40%         |
| Arial          | 1.074 | 30  | 5.15        | 1.62         | 4.04 | 47%         |
| Helvetica Neue | 1.074 | 30  | 5.15        | 1.53         | 3.59 | 50%         |
| Georgia        | 1.300 | 30  | 9.62        | 2.50         | 8.41 | 60%         |
| Nunito         | 1.137 | 30  | 3.56        | 1.41         | 3.21 | 50%         |
| **all**        |       | 210 | 9.62        | 1.72         | 4.21 | 52%         |

#### One ratio per string kind, shared by all fonts

| ratio key | ratio | n   | max abs err | mean abs err | p90  | within 1 px |
| --------- | ----- | --- | ----------- | ------------ | ---- | ----------- |
| sentence  | 1.031 | 70  | 2.23        | 0.66         | 1.65 | 84%         |
| caps      | 1.308 | 70  | 1.62        | 0.59         | 1.00 | 93%         |
| digits    | 1.136 | 70  | 4.74        | 0.93         | 2.10 | 73%         |
| **all**   |       | 210 | 4.74        | 0.72         | 1.62 | 83%         |

#### One ratio per font and string kind

| ratio key                 | ratio | n   | max abs err | mean abs err | p90  | within 1 px |
| ------------------------- | ----- | --- | ----------- | ------------ | ---- | ----------- |
| system-ui / sentence      | 1.055 | 10  | 1.61        | 0.85         | 1.61 | 80%         |
| system-ui / caps          | 1.266 | 10  | 1.34        | 0.54         | 1.34 | 90%         |
| system-ui / digits        | 1.091 | 10  | 0.73        | 0.31         | 0.73 | 100%        |
| Inter / sentence          | 1.027 | 10  | 0.49        | 0.36         | 0.49 | 100%        |
| Inter / caps              | 1.300 | 10  | 0.60        | 0.40         | 0.60 | 100%        |
| Inter / digits            | 1.050 | 10  | 0.70        | 0.41         | 0.70 | 100%        |
| Roboto / sentence         | 0.977 | 10  | 0.73        | 0.48         | 0.73 | 100%        |
| Roboto / caps             | 1.315 | 10  | 0.90        | 0.42         | 0.90 | 100%        |
| Roboto / digits           | 1.117 | 10  | 0.53        | 0.30         | 0.53 | 100%        |
| Arial / sentence          | 1.034 | 10  | 0.55        | 0.34         | 0.55 | 100%        |
| Arial / caps              | 1.310 | 10  | 0.97        | 0.59         | 0.97 | 100%        |
| Arial / digits            | 1.136 | 10  | 0.96        | 0.49         | 0.96 | 100%        |
| Helvetica Neue / sentence | 1.038 | 10  | 0.62        | 0.37         | 0.62 | 100%        |
| Helvetica Neue / caps     | 1.261 | 10  | 0.91        | 0.48         | 0.91 | 100%        |
| Helvetica Neue / digits   | 1.130 | 10  | 0.87        | 0.44         | 0.87 | 100%        |
| Georgia / sentence        | 0.977 | 10  | 0.73        | 0.49         | 0.73 | 100%        |
| Georgia / caps            | 1.300 | 10  | 1.51        | 0.73         | 1.51 | 90%         |
| Georgia / digits          | 1.292 | 10  | 1.21        | 0.60         | 1.21 | 90%         |
| Nunito / sentence         | 1.080 | 10  | 1.05        | 0.50         | 1.05 | 90%         |
| Nunito / caps             | 1.314 | 10  | 0.92        | 0.52         | 0.92 | 100%        |
| Nunito / digits           | 1.162 | 10  | 0.56        | 0.33         | 0.56 | 100%        |
| **all**                   |       | 210 | 1.61        | 0.47         | 0.90 | 97%         |

#### One ratio per string kind, sans-serif fonts only (Georgia excluded)

| ratio key | ratio | n   | max abs err | mean abs err | p90  | within 1 px |
| --------- | ----- | --- | ----------- | ------------ | ---- | ----------- |
| sentence  | 1.031 | 60  | 2.23        | 0.60         | 1.37 | 88%         |
| caps      | 1.308 | 60  | 1.62        | 0.57         | 1.00 | 95%         |
| digits    | 1.111 | 60  | 1.56        | 0.59         | 1.33 | 82%         |
| **all**   |       | 180 | 2.23        | 0.59         | 1.12 | 88%         |

### Firefox, ratios fitted on Chromium applied to Firefox (cross-renderer)

#### Per string kind (Chromium fit) on Firefox

| ratio key | ratio | n   | max abs err | mean abs err | p90  | within 1 px |
| --------- | ----- | --- | ----------- | ------------ | ---- | ----------- |
| sentence  | 1.031 | 70  | 2.23        | 0.66         | 1.65 | 84%         |
| caps      | 1.308 | 70  | 1.62        | 0.59         | 1.00 | 93%         |
| digits    | 1.136 | 70  | 4.74        | 0.93         | 2.10 | 73%         |
| **all**   |       | 210 | 4.74        | 0.72         | 1.62 | 83%         |

#### Per font and kind (Chromium fit) on Firefox

| ratio key                 | ratio | n   | max abs err | mean abs err | p90  | within 1 px |
| ------------------------- | ----- | --- | ----------- | ------------ | ---- | ----------- |
| system-ui / sentence      | 1.055 | 10  | 1.61        | 0.85         | 1.61 | 80%         |
| system-ui / caps          | 1.266 | 10  | 1.34        | 0.54         | 1.34 | 90%         |
| system-ui / digits        | 1.091 | 10  | 0.73        | 0.31         | 0.73 | 100%        |
| Inter / sentence          | 1.027 | 10  | 0.49        | 0.36         | 0.49 | 100%        |
| Inter / caps              | 1.300 | 10  | 0.60        | 0.40         | 0.60 | 100%        |
| Inter / digits            | 1.050 | 10  | 0.70        | 0.41         | 0.70 | 100%        |
| Roboto / sentence         | 0.977 | 10  | 0.73        | 0.48         | 0.73 | 100%        |
| Roboto / caps             | 1.315 | 10  | 0.90        | 0.42         | 0.90 | 100%        |
| Roboto / digits           | 1.117 | 10  | 0.53        | 0.30         | 0.53 | 100%        |
| Arial / sentence          | 1.034 | 10  | 0.55        | 0.34         | 0.55 | 100%        |
| Arial / caps              | 1.310 | 10  | 0.97        | 0.59         | 0.97 | 100%        |
| Arial / digits            | 1.136 | 10  | 0.96        | 0.49         | 0.96 | 100%        |
| Helvetica Neue / sentence | 1.038 | 10  | 0.62        | 0.37         | 0.62 | 100%        |
| Helvetica Neue / caps     | 1.261 | 10  | 0.91        | 0.48         | 0.91 | 100%        |
| Helvetica Neue / digits   | 1.130 | 10  | 0.87        | 0.44         | 0.87 | 100%        |
| Georgia / sentence        | 0.977 | 10  | 0.73        | 0.49         | 0.73 | 100%        |
| Georgia / caps            | 1.300 | 10  | 1.51        | 0.73         | 1.51 | 90%         |
| Georgia / digits          | 1.292 | 10  | 1.21        | 0.60         | 1.21 | 90%         |
| Nunito / sentence         | 1.080 | 10  | 1.05        | 0.50         | 1.05 | 90%         |
| Nunito / caps             | 1.314 | 10  | 0.92        | 0.52         | 0.92 | 100%        |
| Nunito / digits           | 1.162 | 10  | 0.56        | 0.33         | 0.56 | 100%        |
| **all**                   |       | 210 | 1.61        | 0.47         | 0.90 | 97%         |

### Ratio table (font size / trimmed ink height), Chromium, weight 400

Each cell: sentence / caps / digits ratio, ink heights in brackets; box = getBoundingClientRect height.

| font           | size | box h | sentence   | caps       | digits     |
| -------------- | ---- | ----- | ---------- | ---------- | ---------- |
| system-ui      | 11   | 13.0  | 1.000 (11) | 1.375 (8)  | 1.100 (10) |
| system-ui      | 12   | 15.0  | 1.000 (12) | 1.333 (9)  | 1.091 (11) |
| system-ui      | 13   | 16.0  | 1.000 (13) | 1.300 (10) | 1.083 (12) |
| system-ui      | 14   | 17.0  | 1.000 (14) | 1.400 (10) | 1.077 (13) |
| system-ui      | 16   | 18.0  | 1.000 (16) | 1.231 (13) | 1.067 (15) |
| system-ui      | 18   | 21.0  | 1.000 (18) | 1.200 (15) | 1.059 (17) |
| system-ui      | 20   | 23.0  | 1.053 (19) | 1.250 (16) | 1.053 (19) |
| system-ui      | 24   | 28.0  | 1.091 (22) | 1.263 (19) | 1.091 (22) |
| system-ui      | 28   | 33.0  | 1.120 (25) | 1.273 (22) | 1.120 (25) |
| system-ui      | 32   | 38.0  | 1.103 (29) | 1.280 (25) | 1.103 (29) |
| Inter          | 11   | 14.0  | 1.000 (11) | 1.375 (8)  | 1.100 (10) |
| Inter          | 12   | 15.0  | 1.000 (12) | 1.333 (9)  | 1.091 (11) |
| Inter          | 13   | 16.0  | 1.000 (13) | 1.300 (10) | 1.000 (13) |
| Inter          | 14   | 17.0  | 1.000 (14) | 1.273 (11) | 1.000 (14) |
| Inter          | 16   | 20.0  | 1.000 (16) | 1.333 (12) | 1.067 (15) |
| Inter          | 18   | 21.0  | 1.000 (18) | 1.286 (14) | 1.059 (17) |
| Inter          | 20   | 24.0  | 1.053 (19) | 1.333 (15) | 1.053 (19) |
| Inter          | 24   | 29.0  | 1.043 (23) | 1.333 (18) | 1.043 (23) |
| Inter          | 28   | 34.0  | 1.037 (27) | 1.273 (22) | 1.077 (26) |
| Inter          | 32   | 39.0  | 1.032 (31) | 1.280 (25) | 1.067 (30) |
| Roboto         | 11   | 13.0  | 0.917 (12) | 1.375 (8)  | 1.100 (10) |
| Roboto         | 12   | 14.0  | 1.000 (12) | 1.333 (9)  | 1.091 (11) |
| Roboto         | 13   | 15.0  | 1.000 (13) | 1.300 (10) | 1.083 (12) |
| Roboto         | 14   | 16.0  | 1.000 (14) | 1.273 (11) | 1.077 (13) |
| Roboto         | 16   | 19.0  | 1.000 (16) | 1.333 (12) | 1.143 (14) |
| Roboto         | 18   | 21.0  | 1.000 (18) | 1.385 (13) | 1.125 (16) |
| Roboto         | 20   | 24.0  | 0.952 (21) | 1.333 (15) | 1.111 (18) |
| Roboto         | 24   | 28.0  | 1.000 (24) | 1.333 (18) | 1.143 (21) |
| Roboto         | 28   | 33.0  | 1.000 (28) | 1.333 (21) | 1.120 (25) |
| Roboto         | 32   | 38.0  | 1.000 (32) | 1.280 (25) | 1.103 (29) |
| Arial          | 11   | 12.0  | 1.000 (11) | 1.375 (8)  | 1.100 (10) |
| Arial          | 12   | 14.0  | 1.000 (12) | 1.333 (9)  | 1.091 (11) |
| Arial          | 13   | 15.0  | 1.000 (13) | 1.300 (10) | 1.083 (12) |
| Arial          | 14   | 16.0  | 1.077 (13) | 1.273 (11) | 1.167 (12) |
| Arial          | 16   | 18.0  | 1.000 (16) | 1.333 (12) | 1.143 (14) |
| Arial          | 18   | 21.0  | 1.059 (17) | 1.385 (13) | 1.200 (15) |
| Arial          | 20   | 23.0  | 1.053 (19) | 1.250 (16) | 1.111 (18) |
| Arial          | 24   | 28.0  | 1.043 (23) | 1.263 (19) | 1.143 (21) |
| Arial          | 28   | 32.0  | 1.037 (27) | 1.273 (22) | 1.120 (25) |
| Arial          | 32   | 37.0  | 1.032 (31) | 1.280 (25) | 1.103 (29) |
| Helvetica Neue | 11   | 12.0  | 1.100 (10) | 1.375 (8)  | 1.100 (10) |
| Helvetica Neue | 12   | 14.0  | 1.000 (12) | 1.333 (9)  | 1.091 (11) |
| Helvetica Neue | 13   | 15.0  | 1.000 (13) | 1.300 (10) | 1.083 (12) |
| Helvetica Neue | 14   | 16.0  | 1.077 (13) | 1.273 (11) | 1.167 (12) |
| Helvetica Neue | 16   | 18.0  | 1.000 (16) | 1.333 (12) | 1.143 (14) |
| Helvetica Neue | 18   | 22.0  | 1.059 (17) | 1.200 (15) | 1.125 (16) |
| Helvetica Neue | 20   | 24.0  | 1.053 (19) | 1.250 (16) | 1.111 (18) |
| Helvetica Neue | 24   | 29.0  | 1.043 (23) | 1.263 (19) | 1.091 (22) |
| Helvetica Neue | 28   | 34.0  | 1.037 (27) | 1.273 (22) | 1.167 (24) |
| Helvetica Neue | 32   | 38.0  | 1.032 (31) | 1.280 (25) | 1.143 (28) |
| Georgia        | 11   | 12.0  | 0.917 (12) | 1.375 (8)  | 1.222 (9)  |
| Georgia        | 12   | 14.0  | 1.000 (12) | 1.333 (9)  | 1.333 (9)  |
| Georgia        | 13   | 15.0  | 1.000 (13) | 1.300 (10) | 1.182 (11) |
| Georgia        | 14   | 16.0  | 1.000 (14) | 1.400 (10) | 1.273 (11) |
| Georgia        | 16   | 19.0  | 0.941 (17) | 1.231 (13) | 1.333 (12) |
| Georgia        | 18   | 21.0  | 1.000 (18) | 1.200 (15) | 1.286 (14) |
| Georgia        | 20   | 22.0  | 0.952 (21) | 1.250 (16) | 1.333 (15) |
| Georgia        | 24   | 27.0  | 0.960 (25) | 1.263 (19) | 1.263 (19) |
| Georgia        | 28   | 32.0  | 1.000 (28) | 1.333 (21) | 1.333 (21) |
| Georgia        | 32   | 36.0  | 1.000 (32) | 1.333 (24) | 1.333 (24) |
| Nunito         | 11   | 15.0  | 1.100 (10) | 1.375 (8)  | 1.222 (9)  |
| Nunito         | 12   | 16.0  | 1.091 (11) | 1.333 (9)  | 1.200 (10) |
| Nunito         | 13   | 18.0  | 1.000 (13) | 1.300 (10) | 1.182 (11) |
| Nunito         | 14   | 19.0  | 1.077 (13) | 1.400 (10) | 1.167 (12) |
| Nunito         | 16   | 22.0  | 1.067 (15) | 1.333 (12) | 1.143 (14) |
| Nunito         | 18   | 24.0  | 1.059 (17) | 1.385 (13) | 1.200 (15) |
| Nunito         | 20   | 27.0  | 1.053 (19) | 1.333 (15) | 1.176 (17) |
| Nunito         | 24   | 32.0  | 1.043 (23) | 1.333 (18) | 1.143 (21) |
| Nunito         | 28   | 38.0  | 1.120 (25) | 1.273 (22) | 1.167 (24) |
| Nunito         | 32   | 43.0  | 1.103 (29) | 1.280 (25) | 1.143 (28) |

### Ratio spread per font and kind (min to max over sizes 11 to 32)

| font           | sentence       | caps           | digits         | box h / size |
| -------------- | -------------- | -------------- | -------------- | ------------ |
| system-ui      | 1.000 to 1.120 | 1.200 to 1.400 | 1.053 to 1.120 | 1.13 to 1.25 |
| Inter          | 1.000 to 1.053 | 1.273 to 1.375 | 1.000 to 1.100 | 1.17 to 1.27 |
| Roboto         | 0.917 to 1.000 | 1.273 to 1.385 | 1.077 to 1.143 | 1.14 to 1.20 |
| Arial          | 1.000 to 1.077 | 1.250 to 1.385 | 1.083 to 1.200 | 1.09 to 1.17 |
| Helvetica Neue | 1.000 to 1.100 | 1.200 to 1.375 | 1.083 to 1.167 | 1.09 to 1.22 |
| Georgia        | 0.917 to 1.000 | 1.200 to 1.400 | 1.182 to 1.333 | 1.09 to 1.19 |
| Nunito         | 1.000 to 1.120 | 1.273 to 1.400 | 1.143 to 1.222 | 1.33 to 1.38 |

## Live calibration on the fixture host (question 3)

Live = Chromium at 1280x720, `/?variant=target`, each text node's computed font-size and trimmed ink height. Target = the same page rendered by Firefox. Columns: predicted size (error). single = 1.055; kindDefault = kind-aware sans defaults; calibrated = live ratio of the identical text (page median when none); leaveOneOut* = page median of the other runs (all kinds or the same kind), simulating changed text.

| text            | kind     | css px | ink h | single        | kindDefault   | calibrated   | leaveOneOutMedian | leaveOneOutSameKind |
| --------------- | -------- | ------ | ----- | ------------- | ------------- | ------------ | ----------------- | ------------------- |
| Export          | sentence | 16     | 15    | 15.83 (-0.17) | 15.46 (-0.54) | 16.00 (0.00) | 20.00 (4.00)      | NaN (NaN)           |
| Create          | caps     | 16     | 14    | 14.78 (-1.22) | 18.31 (2.31)  | 16.00 (0.00) | 18.67 (2.67)      | 18.67 (2.67)        |
| Revenue         | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| 7000            | caps     | 24     | 19    | 20.05 (-3.95) | 24.85 (0.85)  | 24.00 (0.00) | 25.33 (1.33)      | 25.33 (1.33)        |
| Customers       | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| 9000            | caps     | 24     | 19    | 20.05 (-3.95) | 24.85 (0.85)  | 24.00 (0.00) | 25.33 (1.33)      | 25.33 (1.33)        |
| Invoice         | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| Customer        | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| Amount          | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| INV-001         | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| Acme            | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| 1,200           | digits   | 16     | 14    | 14.78 (-1.22) | 15.56 (-0.44) | 16.00 (0.00) | 18.67 (2.67)      | NaN (NaN)           |
| INV-002         | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| Globex          | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| 860             | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |
| Search invoices | caps     | 16     | 12    | 12.67 (-3.33) | 15.70 (-0.30) | 16.00 (0.00) | 16.00 (0.00)      | 16.00 (0.00)        |

| method              | max abs err | within 1 px |
| ------------------- | ----------- | ----------- |
| single              | 3.95        | 1/16        |
| kindDefault         | 2.31        | 15/16       |
| calibrated          | 0.00        | 16/16       |
| leaveOneOutMedian   | 4.00        | 11/16       |
| leaveOneOutSameKind | 2.67        | 11/14       |

page median live ratio: 1.333; live runs: 16; target runs: 16

| text            | live ink h (chromium) | target ink h (firefox) |
| --------------- | --------------------- | ---------------------- |
| Export          | 15                    | 15                     |
| Create          | 14                    | 14                     |
| Revenue         | 12                    | 12                     |
| 7000            | 19                    | 19                     |
| Customers       | 12                    | 12                     |
| 9000            | 19                    | 19                     |
| Invoice         | 12                    | 12                     |
| Customer        | 12                    | 12                     |
| Amount          | 12                    | 12                     |
| INV-001         | 12                    | 12                     |
| Acme            | 12                    | 12                     |
| 1,200           | 14                    | 14                     |
| INV-002         | 12                    | 12                     |
| Globex          | 12                    | 12                     |
| 860             | 12                    | 12                     |
| Search invoices | 12                    | 12                     |

### Render-search estimator

Q1 grid (Firefox targets, Chromium renders of the same text and font): n=210, max 0.50, mean 0.24, within 1 px 210/210, exact 109

Misses over 1 px: none

| text            | css px | ink h | predicted | err  |
| --------------- | ------ | ----- | --------- | ---- |
| Export          | 16     | 15    | 15.5      | -0.5 |
| Create          | 16     | 14    | 16.5      | 0.5  |
| Revenue         | 16     | 12    | 16.5      | 0.5  |
| 7000            | 24     | 19    | 24.0      | 0.0  |
| Customers       | 16     | 12    | 16.5      | 0.5  |
| 9000            | 24     | 19    | 24.0      | 0.0  |
| Invoice         | 16     | 12    | 16.5      | 0.5  |
| Customer        | 16     | 12    | 16.5      | 0.5  |
| Amount          | 16     | 12    | 16.5      | 0.5  |
| INV-001         | 16     | 12    | 16.5      | 0.5  |
| Acme            | 16     | 12    | 16.5      | 0.5  |
| 1,200           | 16     | 14    | 16.0      | 0.0  |
| INV-002         | 16     | 12    | 16.5      | 0.5  |
| Globex          | 16     | 12    | 16.5      | 0.5  |
| 860             | 16     | 12    | 16.5      | 0.5  |
| Search invoices | 16     | 12    | 16.5      | 0.5  |

### Weight table

| engine   | font  | size | kind     | 400           | 500           | 600           | 700           |
| -------- | ----- | ---- | -------- | ------------- | ------------- | ------------- | ------------- |
| chromium | Inter | 14   | sentence | 0.340 / 0.204 | 0.366 / 0.233 | 0.385 / 0.259 | 0.415 / 0.283 |
| chromium | Inter | 14   | caps     | 0.473 / 0.293 | 0.521 / 0.334 | 0.562 / 0.368 | 0.610 / 0.408 |
| chromium | Inter | 14   | digits   | 0.348 / 0.209 | 0.366 / 0.236 | 0.392 / 0.264 | 0.406 / 0.286 |
| chromium | Inter | 16   | sentence | 0.322 / 0.202 | 0.340 / 0.231 | 0.375 / 0.257 | 0.391 / 0.281 |
| chromium | Inter | 16   | caps     | 0.473 / 0.309 | 0.496 / 0.355 | 0.536 / 0.395 | 0.598 / 0.438 |
| chromium | Inter | 16   | digits   | 0.347 / 0.227 | 0.384 / 0.258 | 0.406 / 0.285 | 0.435 / 0.315 |
| chromium | Arial | 14   | sentence | 0.382 / 0.238 | 0.382 / 0.238 | 0.427 / 0.301 | 0.427 / 0.301 |
| chromium | Arial | 14   | caps     | 0.453 / 0.302 | 0.453 / 0.302 | 0.558 / 0.402 | 0.558 / 0.402 |
| chromium | Arial | 14   | digits   | 0.393 / 0.239 | 0.393 / 0.239 | 0.450 / 0.310 | 0.450 / 0.310 |
| chromium | Arial | 16   | sentence | 0.344 / 0.219 | 0.344 / 0.219 | 0.394 / 0.280 | 0.394 / 0.280 |
| chromium | Arial | 16   | caps     | 0.476 / 0.318 | 0.476 / 0.318 | 0.591 / 0.437 | 0.591 / 0.437 |
| chromium | Arial | 16   | digits   | 0.378 / 0.243 | 0.378 / 0.243 | 0.456 / 0.317 | 0.456 / 0.317 |
| firefox  | Inter | 14   | sentence | 0.340 / 0.204 | 0.366 / 0.233 | 0.385 / 0.259 | 0.417 / 0.283 |
| firefox  | Inter | 14   | caps     | 0.473 / 0.293 | 0.521 / 0.334 | 0.562 / 0.368 | 0.610 / 0.408 |
| firefox  | Inter | 14   | digits   | 0.348 / 0.209 | 0.366 / 0.236 | 0.393 / 0.264 | 0.406 / 0.286 |
| firefox  | Inter | 16   | sentence | 0.322 / 0.202 | 0.338 / 0.231 | 0.375 / 0.257 | 0.391 / 0.281 |
| firefox  | Inter | 16   | caps     | 0.473 / 0.309 | 0.496 / 0.355 | 0.536 / 0.395 | 0.598 / 0.438 |
| firefox  | Inter | 16   | digits   | 0.348 / 0.228 | 0.384 / 0.258 | 0.406 / 0.285 | 0.435 / 0.315 |
| firefox  | Arial | 14   | sentence | 0.382 / 0.239 | 0.382 / 0.239 | 0.425 / 0.301 | 0.425 / 0.301 |
| firefox  | Arial | 14   | caps     | 0.453 / 0.302 | 0.453 / 0.302 | 0.558 / 0.402 | 0.558 / 0.402 |
| firefox  | Arial | 14   | digits   | 0.393 / 0.239 | 0.393 / 0.239 | 0.450 / 0.310 | 0.450 / 0.310 |
| firefox  | Arial | 16   | sentence | 0.344 / 0.219 | 0.344 / 0.219 | 0.396 / 0.280 | 0.396 / 0.280 |
| firefox  | Arial | 16   | caps     | 0.476 / 0.318 | 0.476 / 0.318 | 0.591 / 0.437 | 0.591 / 0.437 |
| firefox  | Arial | 16   | digits   | 0.378 / 0.243 | 0.378 / 0.243 | 0.456 / 0.317 | 0.456 / 0.317 |

## Line height (question 4)

The fixture host has no multi-line text. The card paragraphs (`.card p`) are single lines with `height: 28px`, so
consecutive line boxes cannot be measured on the fixture. Synthetic paragraphs were measured in Firefox instead: a 260 px wide
`<p>` at y = 20.4 (a fractional offset on purpose), 4 fonts (Arial, Inter, system-ui, Georgia), sizes 13 to 24, line-heights
`normal`, 1.2, 1.4, 1.5 and 28px. Every word has an ascender and a descender, so each line's ink top sits at the same
offset. Line boxes are found from the image alone: bands of rows that hold ink, separated by empty rows. The pitch is the
distance between consecutive band tops, compared with the real pitch (paragraph height divided by the number of lines).

- 100 of 100 cases had separable lines. No two lines merged, even at 1.2.
- The pitch between one pair of lines is off by at most 1.00 px. It alternates (29/28 for 28.8 px) when the line-height is
  fractional or a glyph rounds.
- The mean pitch over all lines (first band top to last band top, divided by the number of gaps) is off by at most 0.09 px.
  Use the mean, not one pair.
- Caveat: the band tops line up only when every line contains a tall glyph. A line of only short lowercase letters would
  shift its band top by the cap-height to x-height gap. In OCR terms, take line tops from lines whose text has an
  ascender or a capital, or use band bottoms for lines with descenders.

Full table: `lineheight.md`.

## Weight (question 5)

Inter and Arial (the fixture font) at weights 400, 500, 600 and 700, sizes 14 and 16, three strings each, in Chromium and
Firefox (the two engines matched within 0.002). Density = ink pixels / trimmed box area. Coverage = mean contrast / 255
over the trimmed box.

- **Absolute density does not separate 400 from 700.** The string matters more than the weight. Inter 700 sentence has a
  coverage of 0.281 to 0.283, and Inter 400 caps has 0.293 to 0.309. Arial 400 digits has a density of 0.393, and Inter 700
  sentence has 0.391 to 0.415. A fixed `relativeWeight` threshold on the target alone would misclassify.
- **Coverage relative to a 400 render of the same text, size and colours separates 400 from 700 reliably.** At 700 the
  ratio is 1.37 to 1.42 for Inter and 1.26 to 1.37 for Arial. At 400 it is 1.00 by construction, and noise is under 0.01
  between engines. Coverage separates weights better than binary density: Inter 700 over 400 is 1.39 by coverage and 1.22
  by density.
- **500 against 600: separable within Inter only, and only against the same-text reference.** Inter steps through
  1.13 to 1.15 (500), 1.26 to 1.28 (600) and 1.37 to 1.42 (700). Across fonts, Inter 600 (1.26 to 1.28) overlaps Arial 700
  (1.26 to 1.37). Arial has no 500 or 600 face: 500 renders as 400 and 600 as 700, with identical pixels. Density cannot
  tell 500 from 600 in general.
- Polarity again: light-on-dark text renders heavier on macOS, so the reference must be rendered in the run's own colours.

## Recommendation

1. **Default ratio constant (no live capture): replace the single number with three ratios, chosen by the OCR text.**
   - `sentence` = 1.031, used when the text has a descender letter (g, j, p, q, y).
   - `digits` = 1.111, used when the only part below the baseline is a comma or semicolon.
   - `caps` = 1.308, used otherwise (caps, digits and plain mixed case reach cap height).

   For sans-serif fonts these give 88% of cases within 1 px, 95% within 1.5 px, 98% within 2 px and 100% within 2.5 px.
   If one constant is required, `glyphSizeRatio = 1.055`. It gives only 40% within 1 px, 58% within 2 px and a max error
   of 6.7 px, so it is not usable as an estimate.

2. **Per-font calibration is needed, and a per-font ratio is not enough: calibrate per string.** When a live capture
   exists, use render search: the live font family, the run's OCR text, the run's sampled colours, sizes 8 to 56, and the
   middle of the sizes whose ink height matches. It was within 0.5 px everywhere here. It costs about 49 small element
   screenshots per distinct (font, text, colour), so cache the results. Matching a live run by identical text and reusing its
   `fontSize / ink` ratio is exact as well, but covers only text that did not change. Do not use the page-wide median ratio
   as the fallback (max error 4 px). Fall back to render search, then to the kind-aware defaults.
3. **`fontSize` delta tolerance against an image.**
   - Render-search path: ±1 px.
   - Kind-aware default path: ±2 px (98% of sans-serif cases), with the brief worded as "about N px".
   - Single-constant path: no defensible tolerance below ±4 px, which already hides 14 to 16 px differences.

   Serif fonts with old-style figures (Georgia digits are off by up to 5 px against the sans ratios) need render search,
   or should not be compared at all.

4. **Weight bucket.** Regular against bold is defensible only as a relative measure: coverage of the target's trimmed glyph
   box divided by the coverage of a 400 render of the same text at the estimated size in the run's colours. Call it bold at
   1.2 or above and regular at 1.07 or below. The design doc's three buckets (regular, medium 500 to 600, bold 700 and up)
   are not defensible. 600 and 700 overlap across fonts, and many system fonts have no 500 or 600 face. Use two buckets,
   regular (400 and below) and bold (600 and up), and do not report a `fontWeight` delta for 500.
   An absolute `relativeWeight` in [0, 1] from the target alone fails, as shown above.
5. Caveat for the targets: every image here is a browser render on macOS. A Figma export or a Linux-rendered PNG
   rasterises with different hinting and gamma. Before trusting the tolerances above on Figma input, re-run `render-search.ts`
   with a Figma-exported target.

## Scripts (in this directory)

- `ink.ts`: a port of `trimToInk` (threshold 40), plus density and coverage.
- `ratios.ts [chromium|firefox]`: the font × size × string grid and the weight grid. Writes `ratios.<engine>.json`.
- `analyze.ts`: ratio fits, error distributions and tables. Writes `analysis.md` and `fitted.json`.
- `classify.ts`: string kind from the OCR text.
- `fixture.ts`: live Chromium capture against the Firefox target of `/?variant=target` at 1280x720, from the fixture host
  served by `pnpm exec vite --port 5287` (set `HOST_ORIGIN` to override). Writes `fixture.json`, `fixture.md` and both PNGs.
- `render-search.ts`: the render-search estimator on the grid and the fixture. Writes `render-search.md`.
- `lineheight.ts`: synthetic multi-line paragraphs in Firefox. Writes `lineheight.json` and `lineheight.md`.
- `dump.ts`, `peek.ts`: debugging views.

Note: the Firefox target was rendered fresh from `aidx-text`'s host. The ocr-spike target `u1-1280.firefox@1x.png` came from
`aidx-659`'s host, whose CSS differs (line-heights, button width), so it was not used.

### Line height table

| font      | size | line-height | computed | true pitch | lines / bands | pair pitches | mean pitch err | max pair err |
| --------- | ---- | ----------- | -------- | ---------- | ------------- | ------------ | -------------- | ------------ |
| Arial     | 13   | normal      | normal   | 15.43      | 8 / 8         | 15,16        | -0.00          | 0.57         |
| Arial     | 13   | 1.2         | 15.6px   | 15.60      | 8 / 8         | 15,16        | -0.03          | 0.60         |
| Arial     | 13   | 1.4         | 18.2px   | 18.20      | 8 / 8         | 18,19        | -0.06          | 0.80         |
| Arial     | 13   | 1.5         | 19.5px   | 19.50      | 8 / 8         | 19,20        | -0.07          | 0.50         |
| Arial     | 13   | 28px        | 28px     | 28.00      | 8 / 8         | 28           | 0.00           | 0.00         |
| Arial     | 14   | normal      | normal   | 16.45      | 8 / 8         | 16,17        | -0.02          | 0.55         |
| Arial     | 14   | 1.2         | 16.8px   | 16.80      | 8 / 8         | 17,16        | -0.09          | 0.80         |
| Arial     | 14   | 1.4         | 19.6px   | 19.60      | 8 / 8         | 20,19        | -0.03          | 0.60         |
| Arial     | 14   | 1.5         | 21px     | 21.00      | 8 / 8         | 21           | 0.00           | 0.00         |
| Arial     | 14   | 28px        | 28px     | 28.00      | 8 / 8         | 28           | 0.00           | 0.00         |
| Arial     | 16   | normal      | normal   | 19.52      | 9 / 9         | 19,20        | -0.02          | 0.52         |
| Arial     | 16   | 1.2         | 19.2px   | 19.20      | 9 / 9         | 19,20        | -0.08          | 0.80         |
| Arial     | 16   | 1.4         | 22.4px   | 22.40      | 9 / 9         | 23,22        | -0.03          | 0.60         |
| Arial     | 16   | 1.5         | 24px     | 24.00      | 9 / 9         | 24           | 0.00           | 0.00         |
| Arial     | 16   | 28px        | 28px     | 28.00      | 9 / 9         | 28           | 0.00           | 0.00         |
| Arial     | 20   | normal      | normal   | 24.65      | 12 / 12       | 24,25        | -0.01          | 0.65         |
| Arial     | 20   | 1.2         | 24px     | 24.00      | 12 / 12       | 24           | 0.00           | 0.00         |
| Arial     | 20   | 1.4         | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| Arial     | 20   | 1.5         | 30px     | 30.00      | 12 / 12       | 30           | 0.00           | 0.00         |
| Arial     | 20   | 28px        | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| Arial     | 24   | normal      | normal   | 28.78      | 12 / 12       | 29,28        | -0.06          | 0.78         |
| Arial     | 24   | 1.2         | 28.8px   | 28.80      | 12 / 12       | 29,28        | 0.02           | 0.80         |
| Arial     | 24   | 1.4         | 33.6px   | 33.60      | 12 / 12       | 34,33        | 0.04           | 0.60         |
| Arial     | 24   | 1.5         | 36px     | 36.00      | 12 / 12       | 36           | 0.00           | 0.00         |
| Arial     | 24   | 28px        | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| Inter     | 13   | normal      | normal   | 17.00      | 8 / 8         | 17           | 0.00           | 0.00         |
| Inter     | 13   | 1.2         | 15.6px   | 15.60      | 8 / 8         | 15,16        | -0.03          | 0.60         |
| Inter     | 13   | 1.4         | 18.2px   | 18.20      | 8 / 8         | 18,19        | -0.06          | 0.80         |
| Inter     | 13   | 1.5         | 19.5px   | 19.50      | 8 / 8         | 19,20        | -0.07          | 0.50         |
| Inter     | 13   | 28px        | 28px     | 28.00      | 8 / 8         | 28           | 0.00           | 0.00         |
| Inter     | 14   | normal      | normal   | 18.00      | 8 / 8         | 18           | 0.00           | 0.00         |
| Inter     | 14   | 1.2         | 16.8px   | 16.80      | 8 / 8         | 17,16        | -0.09          | 0.80         |
| Inter     | 14   | 1.4         | 19.6px   | 19.60      | 8 / 8         | 20,19        | -0.03          | 0.60         |
| Inter     | 14   | 1.5         | 21px     | 21.00      | 8 / 8         | 21           | 0.00           | 0.00         |
| Inter     | 14   | 28px        | 28px     | 28.00      | 8 / 8         | 28           | 0.00           | 0.00         |
| Inter     | 16   | normal      | normal   | 20.00      | 12 / 12       | 20,21        | 0.09           | 1.00         |
| Inter     | 16   | 1.2         | 19.2px   | 19.20      | 12 / 12       | 19,20        | 0.07           | 0.80         |
| Inter     | 16   | 1.4         | 22.4px   | 22.40      | 12 / 12       | 22,23        | 0.05           | 0.60         |
| Inter     | 16   | 1.5         | 24px     | 24.00      | 12 / 12       | 24,25        | 0.09           | 1.00         |
| Inter     | 16   | 28px        | 28px     | 28.00      | 12 / 12       | 28,29        | 0.09           | 1.00         |
| Inter     | 20   | normal      | normal   | 25.00      | 12 / 12       | 24,26        | -0.09          | 1.00         |
| Inter     | 20   | 1.2         | 24px     | 24.00      | 12 / 12       | 23,25        | -0.09          | 1.00         |
| Inter     | 20   | 1.4         | 28px     | 28.00      | 12 / 12       | 27,29        | -0.09          | 1.00         |
| Inter     | 20   | 1.5         | 30px     | 30.00      | 12 / 12       | 29,31        | -0.09          | 1.00         |
| Inter     | 20   | 28px        | 28px     | 28.00      | 12 / 12       | 27,29        | -0.09          | 1.00         |
| Inter     | 24   | normal      | normal   | 30.00      | 18 / 18       | 30           | 0.00           | 0.00         |
| Inter     | 24   | 1.2         | 28.8px   | 28.80      | 18 / 18       | 29,28        | -0.04          | 0.80         |
| Inter     | 24   | 1.4         | 33.6px   | 33.60      | 18 / 18       | 34,33        | -0.01          | 0.60         |
| Inter     | 24   | 1.5         | 36px     | 36.00      | 18 / 18       | 36           | 0.00           | 0.00         |
| Inter     | 24   | 28px        | 28px     | 28.00      | 18 / 18       | 28           | 0.00           | 0.00         |
| system-ui | 13   | normal      | normal   | 16.00      | 8 / 8         | 16           | 0.00           | 0.00         |
| system-ui | 13   | 1.2         | 15.6px   | 15.60      | 8 / 8         | 16,15        | -0.03          | 0.60         |
| system-ui | 13   | 1.4         | 18.2px   | 18.20      | 8 / 8         | 18,19        | -0.06          | 0.80         |
| system-ui | 13   | 1.5         | 19.5px   | 19.50      | 8 / 8         | 20,19        | 0.07           | 0.50         |
| system-ui | 13   | 28px        | 28px     | 28.00      | 8 / 8         | 28           | 0.00           | 0.00         |
| system-ui | 14   | normal      | normal   | 17.00      | 8 / 8         | 17           | 0.00           | 0.00         |
| system-ui | 14   | 1.2         | 16.8px   | 16.80      | 8 / 8         | 17,16        | 0.06           | 0.80         |
| system-ui | 14   | 1.4         | 19.6px   | 19.60      | 8 / 8         | 19,20        | -0.03          | 0.60         |
| system-ui | 14   | 1.5         | 21px     | 21.00      | 8 / 8         | 21           | 0.00           | 0.00         |
| system-ui | 14   | 28px        | 28px     | 28.00      | 8 / 8         | 28           | 0.00           | 0.00         |
| system-ui | 16   | normal      | normal   | 20.00      | 12 / 12       | 20           | 0.00           | 0.00         |
| system-ui | 16   | 1.2         | 19.2px   | 19.20      | 12 / 12       | 19,20        | -0.02          | 0.80         |
| system-ui | 16   | 1.4         | 22.4px   | 22.40      | 12 / 12       | 22,23        | -0.04          | 0.60         |
| system-ui | 16   | 1.5         | 24px     | 24.00      | 12 / 12       | 24           | 0.00           | 0.00         |
| system-ui | 16   | 28px        | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| system-ui | 20   | normal      | normal   | 25.00      | 12 / 12       | 25           | 0.00           | 0.00         |
| system-ui | 20   | 1.2         | 24px     | 24.00      | 12 / 12       | 24           | 0.00           | 0.00         |
| system-ui | 20   | 1.4         | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| system-ui | 20   | 1.5         | 30px     | 30.00      | 12 / 12       | 30           | 0.00           | 0.00         |
| system-ui | 20   | 28px        | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| system-ui | 24   | normal      | normal   | 30.00      | 12 / 12       | 30           | 0.00           | 0.00         |
| system-ui | 24   | 1.2         | 28.8px   | 28.80      | 12 / 12       | 29,28        | 0.02           | 0.80         |
| system-ui | 24   | 1.4         | 33.6px   | 33.60      | 12 / 12       | 34,33        | 0.04           | 0.60         |
| system-ui | 24   | 1.5         | 36px     | 36.00      | 12 / 12       | 36           | 0.00           | 0.00         |
| system-ui | 24   | 28px        | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| Georgia   | 13   | normal      | normal   | 15.00      | 8 / 8         | 15           | 0.00           | 0.00         |
| Georgia   | 13   | 1.2         | 15.6px   | 15.60      | 8 / 8         | 15,16        | -0.03          | 0.60         |
| Georgia   | 13   | 1.4         | 18.2px   | 18.20      | 8 / 8         | 18,19        | -0.06          | 0.80         |
| Georgia   | 13   | 1.5         | 19.5px   | 19.50      | 8 / 8         | 19,20        | -0.07          | 0.50         |
| Georgia   | 13   | 28px        | 28px     | 28.00      | 8 / 8         | 28           | 0.00           | 0.00         |
| Georgia   | 14   | normal      | normal   | 17.00      | 8 / 8         | 17           | 0.00           | 0.00         |
| Georgia   | 14   | 1.2         | 16.8px   | 16.80      | 8 / 8         | 17,16        | 0.06           | 0.80         |
| Georgia   | 14   | 1.4         | 19.6px   | 19.60      | 8 / 8         | 19,20        | -0.03          | 0.60         |
| Georgia   | 14   | 1.5         | 21px     | 21.00      | 8 / 8         | 21           | 0.00           | 0.00         |
| Georgia   | 14   | 28px        | 28px     | 28.00      | 8 / 8         | 28           | 0.00           | 0.00         |
| Georgia   | 16   | normal      | normal   | 19.00      | 10 / 10       | 19           | 0.00           | 0.00         |
| Georgia   | 16   | 1.2         | 19.2px   | 19.20      | 10 / 10       | 19,20        | -0.09          | 0.80         |
| Georgia   | 16   | 1.4         | 22.4px   | 22.40      | 10 / 10       | 23,22        | 0.04           | 0.60         |
| Georgia   | 16   | 1.5         | 24px     | 24.00      | 10 / 10       | 24           | 0.00           | 0.00         |
| Georgia   | 16   | 28px        | 28px     | 28.00      | 10 / 10       | 28           | 0.00           | 0.00         |
| Georgia   | 20   | normal      | normal   | 24.00      | 12 / 12       | 24           | 0.00           | 0.00         |
| Georgia   | 20   | 1.2         | 24px     | 24.00      | 12 / 12       | 24           | 0.00           | 0.00         |
| Georgia   | 20   | 1.4         | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| Georgia   | 20   | 1.5         | 30px     | 30.00      | 12 / 12       | 30           | 0.00           | 0.00         |
| Georgia   | 20   | 28px        | 28px     | 28.00      | 12 / 12       | 28           | 0.00           | 0.00         |
| Georgia   | 24   | normal      | normal   | 29.00      | 15 / 15       | 29           | 0.00           | 0.00         |
| Georgia   | 24   | 1.2         | 28.8px   | 28.80      | 15 / 15       | 29,28        | 0.06           | 0.80         |
| Georgia   | 24   | 1.4         | 33.6px   | 33.60      | 15 / 15       | 33,34        | -0.03          | 0.60         |
| Georgia   | 24   | 1.5         | 36px     | 36.00      | 15 / 15       | 36           | 0.00           | 0.00         |
| Georgia   | 24   | 28px        | 28px     | 28.00      | 15 / 15       | 28           | 0.00           | 0.00         |

cases where lines merged in the image (bands != lines): 0/100 ()
separable cases: max per-pair error 1.00 px, max mean-pitch error 0.09 px, per-pair within 1 px 100/100
