# @conciv/extension-design

Internal to `@conciv/it`. The design extension holds a target image per route and viewport width, captures the live
page at that width, and returns the components that differ from the design, ranked, with the measured deltas and the
source location that sets each value.

## Tools

- `design_target` registers a PNG (a file under the project, or base64) as the design of a route at a width. It
  replaces an earlier target of the same route and width.
- `design_diff` captures the live page and compares it with the target.
- `design_status` reports, per registered width, whether the last diff left anything above tolerance. A route is
  `done` when no component is above tolerance and nothing is unmatched.
- `design_capture`, `design_winner` and `design_clear` capture the page, name the CSS declaration that wins a
  property, and remove targets.

## How text is compared

Every renderer rasterizes glyphs differently, so identical text differs pixel by pixel between a designer's export and
the developer's browser. The extension compares text as text and keeps it out of the pixel comparison only when both
sides agree on it.

1. **Foreground color from glyph ink.** The `foreground` delta samples the median color of the eroded ink inside a
   component's glyph boxes, not the anti-aliased edges of its tile. A component with no ink reports no foreground.
2. **Live text.** Each captured component carries its glyphs: one entry per text node it paints (stopping at nested
   components), with one box per line, rounded out to whole pixels and grown by `glyphHalo`. An empty `input` or
   `textarea` with a placeholder contributes the placeholder as a glyph whose box is the field's padding box.
3. **Target text.** `design_target` reads the image once with OCR and stores each run as a `text` node under the
   target root, its box trimmed to the ink inside it. The result carries `text: {runs}`, or `text: {runs: 0, error}`
   when the reader fails; the target is stored either way.
4. **Groups.** On each diff, live glyphs and target runs whose boxes overlap by more than half the smaller box are
   joined into groups, across component boundaries. A group needs both sides. Each side's strings are joined in
   reading order, case folded and stripped of whitespace. A group agrees when the strings are equal, the ink colors
   are within `colorDeltaE`, and the ink-trimmed box unions agree edge for edge within `geometryPx`. Ink colors on
   both sides are sampled the same way: ink inside the trimmed boxes, against the median background of their union
   grown by `tileMargin`.
5. **Masking.** Before the matcher runs, the agreeing boxes of both sides, grown by `glyphHalo` plus `blurRadius`,
   are painted with the target's pixels on a copy of the live capture. Everything else compares as before. The
   original capture is kept for color sampling, unmatched regions and the stored run image; the diff image is drawn on
   the masked copy.
6. **Text delta.** A gated component that owns a group whose strings differ carries a `text` delta with the live and
   the target string. Its provenance is the component's own source location (`via: 'source'`).
7. **Status** is unchanged: no component above tolerance and nothing unmatched.

A target registered before text runs existed has no runs: nothing is grouped or masked, and diffs behave as they did.
Registering it again reads its text.

## OCR engine

PaddleOCR PP-OCRv6 tiny (detection and recognition) through `ppu-paddle-ocr`, with ONNX inference on
`onnxruntime-web` (WebAssembly) on one thread. The models are vendored under `models/` (Apache-2.0, see
`models/README.md`) and passed as buffers, so nothing is downloaded at runtime and no telemetry is written. The
remaining native code is the `@napi-rs/canvas` prebuilt that `ppu-ocv` uses for image decoding.

`ppu-paddle-ocr` has no Node WebAssembly entry, so the reader imports five of its internal modules by file URL and
builds the service on `onnxruntime-web`. For that reason `ppu-paddle-ocr` 6.6.1, `ppu-ocv` 4.0.0 and
`onnxruntime-web` 1.31.1 are pinned exactly: a release could move the imported files, and the integration test that
asserts runs after registration is what catches it.

The service is created once per process, reads are serialized, and it is disposed with the extension. A read takes
a few hundred milliseconds per 1280x720 image once warm, and happens once per registration.

## Constants

All in `src/shared/tolerances.ts`.

| name               | value | role                                                                              |
| ------------------ | ----- | --------------------------------------------------------------------------------- |
| `glyphHalo`        | 1     | pixels a live glyph box grows by                                                  |
| `inkTrimThreshold` | 40    | per-channel distance from a box's top-left pixel that counts as ink when trimming |
| `geometryPx`       | 2     | edge distance allowed between a group's trimmed live and target box unions        |
| `colorDeltaE`      | 3     | ink color agreement and ink mask threshold                                        |
| `tileMargin`       | 8     | growth of the trimmed union whose median is the ink background                    |
| `blurRadius`       | 1     | added to `glyphHalo` when painting over agreeing boxes                            |

## Blind spots

- Figma node targets are not supported; targets are images.
- A text change inside a component whose pixels stay below `tileGate`, or under a parent the matcher does not
  descend into, produces no `text` delta.
- A row shifted by more than half a line forms no group; it stays in the pixels and the geometry deltas report it.
- Weight, italic, decoration or letter-spacing changes with the same string, ink color and place are masked.
- Tall images (above about 2000px) lose OCR recall on small text; missed runs stay in the pixels.
- 2x exports are downscaled nearest-neighbour by the adapter and are not separately measured.
- Icon fonts, rotated text and text over photographs are not read; they stay in the pixels.

## Known false positives

- **OCR misreads** on low-contrast or substituted fonts surface as a `text` delta showing both strings.
- **Reading order** on unusual inline wrapping (floats, bidi text) can join words in another order, giving a `text`
  delta whose strings hold the same words.
- **Truncated text** (`text-overflow: ellipsis`): the DOM string is longer than the painted one.
- **Hyphenation** and soft hyphens: a hyphen read at a line end is not in the DOM string.
