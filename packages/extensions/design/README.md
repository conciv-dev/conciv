# @conciv/extension-design

Internal to `@conciv/it`. The design extension holds a target image per route and viewport width, captures the live
page at that width, and returns the components that differ from the design, ranked, with the measured deltas and the
source location that sets each value.

## Overview

The package.json describes this as the design built-in extension, internal to @conciv/it. It holds a target image per route and width, reads the target's text once with OCR, captures the live page at that width and returns ranked component deltas with style provenance. The root exports pick a browser condition (dist/client.js) or an import condition (dist/server.js), with subpaths ./client, ./server, ./defs, ./provenance, ./text-groups, ./paddle, ./colors and ./types. The `build` script runs four steps in order: tsdown, vite build (client), vite build with vite.xray.config.ts (xray page into dist/xray), then tsc declaration emit (which excludes src/xray).

## Interface

- default `defineConfig` (`tsdown.config.ts`): bundles `src/server.ts`, `src/shared/defs.ts`, `src/server/provenance.ts`, `src/server/differ.ts`, `src/server/target.ts` and `src/server/deltas.ts` as ESM with `dts: false`
- default `defineConfig` (`vite.config.ts`): library build of `src/client.ts` to `client.js` (ES format), with `emptyOutDir: false` and sourcemaps
- default `defineConfig` (`vite.xray.config.ts`): builds `src/xray/` into `dist/xray/` with UnoCSS and the Solid plugin; in serve mode it loads `../../it/dist/vite.js` instead of plain Solid
- default `defineConfig` (`uno.config.ts`): UnoCSS with `presetConciv`, scanning `src/xray/**` and `../../ui-kit-system/src/**`
- package.json `exports`: `.` (browser maps to client, import maps to server), `./client`, `./server`, `./defs`, `./provenance` (`dist/server/provenance`), `./text-groups` (`dist/server/differ`), `./paddle` (`dist/server/target`), `./colors` (`dist/server/deltas`), `./types` (types only)
- package.json script `dev:xray`: runs `vite --config vite.xray.config.ts`

## Source tree

Each slot is one interface in `src/shared/types.ts`. Every implementation of a slot is a module-private function or
object in one file, and that file exports one table of them; `src/server.ts` picks from the tables by `designConfig`.

```text
src/
  client.ts            widget entry: measurer, mirror, region and snapdom capture, type renders, CSS winner
  server.ts            extension entry: pickRuntime over the slot tables, CSS map, x-ray routes, dispose
  shared/
    defs.ts            tool definitions, wire schemas, errors and messages
    types.ts           domain types and the slot interfaces
    tolerances.ts      TOLERANCES, designConfig, frame message names, source attribute, property aliases, tolerance counts
  server/
    target.ts          ADAPTERS, TEXT_READERS (PaddleOCR), ENRICHERS, SEGMENTERS, ROLE_RULES and the registration pipeline
    deltas.ts          DELTA_KINDS (border, axis and columns included), COLOR_METRICS, sampled fills and glyph ink color, sideFrom
    provenance.ts      MAPPERS, mapDeclaration, the CSS source map, JSX site reading and live text roles
    raster.ts          pure pixel and box operations
    store.ts           the target store on disk
    pair.ts            PAIRERS (the calibrated vote), RANKERS (impact), the pair tree, alignment offsets and pairTwins
    loop.ts            items, stages, score, brief and stop rules, round history, the run queue and the HMR settle trigger
    differ.ts          PIXEL_COMPARATORS, text groups, the diff run, unbuilt, extra and offset entries, and the tool bindings
    xray-routes.ts     HTTP routes for the x-ray
  xray/
    entry.tsx          mount
    router.tsx         routes, search schema, data loading
    panel.tsx          panel, rows, detail, fix prompt
    stage.tsx          canvas and stage toolbar
    states.tsx         loading, empty and error states, shortcuts
```

`src/client/specificity.d.ts` types `@bramus/specificity`. `src/xray/index.html` and `src/xray/xray.css` are the
x-ray page shell. `test/dev-fixture.ts` is the sample data `dev:xray` shows with `?fixture=1`.

## Invariants

- `rollupOptions.external` (`vite.config.ts`) treats imports matching solid-js, zod, @conciv/, lucide-solid, rrweb, @rrweb/, @tanstack/, @orpc/, @zumer/ or @bramus/ as external unless the import path contains `.css`
- `renderBuiltUrl` (`vite.xray.config.ts`) prefixes HTML asset URLs with `xray/` and uses relative URLs for JS and CSS
- `exclude: ["src/xray/**"]` (`tsconfig.build.json`): no declarations are emitted for the xray page
- `ppu-paddle-ocr`, `ppu-ocv` and `onnxruntime-web` are pinned exactly (see [OCR engine](#ocr-engine))

## Side Effects

- `build` script (package.json): writes dist/ (server.js, shared/defs.js, server/provenance.js, server/differ.js, server/target.js, server/deltas.js, client.js, xray/, .d.ts files); the xray build empties `dist/xray/` (`emptyOutDir: true` in `vite.xray.config.ts`)
- `compiler` (`vite.xray.config.ts`): in serve mode it dynamically imports the sibling package build at `../../it/dist/vite.js`
- `design_target` runs OCR in-process on `onnxruntime-web`; the service is created on first read and disposed with the extension

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first). The package has no `test` script; its behaviour is covered by `packages/it/test/design.it.test.ts`.

## Tools

- `design_target` registers a PNG (a file under the project, or base64) as the design of a route at a width. It
  replaces an earlier target of the same route and width.
- `design_diff` captures the live page and compares it with the target.
- `design_status` reports the current target's last run: score, round, stop and `done`, which holds when the stop
  is `done` or the score is no worse than the accepted run's on the same capture path.
- `design_capture`, `design_winner` and `design_clear` capture the page, name the CSS declaration that wins a
  property, and remove targets.

## How text is compared

Every renderer rasterizes glyphs differently, so identical text differs pixel by pixel between a designer's export and
the developer's browser. The extension compares text as text and keeps it out of the pixel comparison only when both
sides agree on it.

1. **Foreground color from glyph ink.** The `foreground` delta samples the ink inside a component's glyph boxes, not
   the anti-aliased edges of its tile: the median color of the pixels within `colorDeltaE` of the pixel farthest from
   the background, so blended edges and subpixel color fringes do not count. A component paints text, and is compared
   on `foreground`, when it captured glyphs. A component with no ink reports no foreground.
2. **Live text.** Each captured component carries its glyphs: one entry per text node it paints (stopping at nested
   components), with one box per line, rounded out to whole pixels and grown by `glyphHalo`. An empty `input` or
   `textarea` with a placeholder contributes the placeholder as a glyph whose box is the field's padding box.
3. **Target text.** `design_target` reads the image once with OCR and stores each run as a `text` node under the
   target root, its box trimmed to the ink inside it. The result carries `text: {runs}`, or `text: {runs: 0, error}`
   when the reader fails; the target is stored either way.
4. **Groups.** On each diff, live glyphs and target runs whose boxes overlap by more than half the smaller box are
   joined into groups, across component boundaries. A group needs both sides. Each side's strings are joined in
   reading order, case folded and stripped of whitespace. A group's text agrees when the strings are equal and the
   ink-trimmed box unions agree edge for edge within `geometryPx`. Ink color is checked per component in the group:
   the live ink inside its trimmed glyph boxes against the target ink inside the same glyph boxes, within
   `colorDeltaE`, each against the median background of the boxes' union grown by `tileMargin`.
5. **Masking.** Before the matcher runs, each component whose text and ink agree contributes its ink-trimmed glyph
   boxes, and the parts of the target boxes within `geometryPx` of them. These boxes, grown by `glyphHalo` plus
   `blurRadius`, are painted with the target's pixels on a copy of the live capture. A placeholder is masked by its
   ink, never by its field box, so a changed border or background of the field stays in the diff. Everything else compares as before. The
   original capture is kept for color sampling, unmatched regions and the stored run image; the diff image is drawn on
   the masked copy.
6. **Text delta.** A gated component that owns a group whose strings differ carries a `text` delta with the live and
   the target string. When one OCR run spans several components, their strings are found in the run as whole words
   left to right; the first component whose string is missing owns the delta, and its target string is the rest of
   the run. Its provenance is the component's own source location (`via: 'source'`).
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

pnpm 11 fails an install on any dependency build script it was not told about, and `onnxruntime-web` depends on
`protobufjs`, whose postinstall only prints a version warning. Add `allowBuilds: {protobufjs: false}` to your
`pnpm-workspace.yaml` (or `ignoredBuiltDependencies: [protobufjs]` on older pnpm).

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
- Position agreement is checked per group, not per component: one OCR box spanning several labels cannot be split, so
  a label moved inside a run whose union stays within `geometryPx` is masked.
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
