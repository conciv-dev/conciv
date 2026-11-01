# Stage 9: Implementation Readiness Report

**Target:** `docs/superpowers/specs/2026-11-01-design-text-layer.md` (DetailedRange 188-341)

| Reviewer                       | Status    |
| ------------------------------ | --------- |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details`         | completed |
| `egm-style`                    | completed |

**Verdict:** not ready. An implementer would have to decide which pairs get text deltas, how text matching gets its data, which files feed the foreground estimator, and how the reader is resolved and wired.

## Blockers

1. **Both pixel gates untouched** (items 15, 18; tile.ts:111 descent, diff.ts:185 pre-filter on raw `mismatch`). With text ignored a recolored or same-width label never becomes a pair, so `textDeltas` and the foreground estimator never run. (readiness B3, codebase B1)
2. **Eroded boxes are not glyph ink** (items 14, 21). A label box is 70-80% background; the median is the button color on both sides. The parked branch's `glyphCoreColor` (aidx-659 `deltas/colors.ts:17-34`: ΔE mask against sampled background, eroded, `null` when empty) already solves this. (codebase B2)
3. **Files that must change are missing**: `server/captures/tab.ts` (`LiveComponentTreeSchema` strips `glyphs`), `server/adapters/image.ts` (must return `text`), `server/deltas.ts` (`sideStyles`/`sideFrom` feed `foreground`; text-leaf condition), `matchers/tile.ts` `colorAgrees` (calls `sampledFills`), `xray/dev-fixture.ts` and `xray/list.tsx` (`KIND: Record<DeltaKindName,…>` needs `text`), `registries/delta-kinds.ts` (say `text` is not a `DeltaKind`), `xray/fix-prompt.ts`, IT `mapFixture` literal (needs `glyphs: []`, contradicting "existing tests untouched"). (readiness B2, codebase B3, M7, M8)
4. **The reader cannot load as described** (item 8): ppu's `exports` exposes only `.`, `./web`, `./mobile`; deep imports throw `ERR_PACKAGE_PATH_NOT_EXPORTED`; the spike uses a hard-coded file URL. `ppu-ocv` (4.0.0) is imported directly but not declared. "ppu's Node platform object" is wrong: the spike builds its own from ppu-ocv's `Canvas`, `CanvasProcessor`, `CanvasToolkit`, `ImageProcessor`, `Contours`, `cv`, calls `ImageProcessor.initRuntime()` and assigns the sessions by hand. Name the resolution method, tsdown `external` entries, and add `ppu-ocv`. (codebase B4, M1; readiness M1)
5. **`textDeltas({pair, runs})` cannot implement its rule**: needs every pair or the live tree for "no other pair's glyphs"; no coordinate translation when `targetBox != liveBox`; `targetBox === null` unspecified; a container whose children were never paired claims their runs and emits `{live: '', target: 'Export Create'}`. (readiness B4, codebase M12)
6. **Non-DOM text gives false `live: ''` deltas on the fixture itself**: `<input placeholder="Search invoices">`. (readiness B5)
7. **Ignore-list scope for containers unspecified**: descendants' glyphs or own only. (readiness B6)
8. **Seven commits never defined**; items 4 and 6 make fields required and break typecheck on their own. (readiness B1, codebase M17, style 1)

## Major

- Models: ppu 6.6.1 ships no `.onnx`/`.ort`/`.txt`; the spike loads `models/ppu/detection/ort/PP-OCRv6_tiny_det.ort`, `recognition/ort/PP-OCRv6_tiny_rec.ort`, `recognition/ppocrv6_tiny_dict.txt`; buffers must always be passed or ppu downloads a default. `models/` unconditional; add license. (codebase M2)
- Spike options omitted: `minimumConfidence: 0` (else ppu's default confidence filter returns), `ort.env.wasm.numThreads`, input = PNG bytes via existing `encodePng` to `service.recognize(bytes, {flatten: true, noCache: true})`, ppu box `{x,y,width,height}` to `Box {x,y,w,h}`. (codebase M3)
- Trim port has no algorithm: `sharp.trim({threshold: 40})`, corner background, distance metric, `< 2px` skip; threshold is a new constant. trim.ts path is `ocr-spike/trim.ts`. (codebase M4, readiness M2)
- `onnxruntime-web` unpinned; spike used 1.31.1; lockfile already has `1.26.0-dev…` via `apps/site`; `minimumReleaseAge: 2880` may block. (codebase M5, style 2)
- Required `ownMismatch` breaks `lastResult` on stored runs (`safeParse` returns null): status, breakpoints and x-ray see no run. (codebase M6, readiness M12)
- `ownMismatch` definition circular / location: parked 74f4381ae subtracts all matched children inside the matcher. Pick one. `Pair.ownMismatch` missing from item 4. Ignore boxes must be translated to the tile origin. (readiness M3, codebase M9)
- Page-level `mismatch`, `DiffReport.mismatch`, status mismatch and `paintDiff` overlay stay raw; say so. (readiness M4)
- Item 22 (enricher) does nothing: `TargetNode.fills` is never read; drop it. (readiness M5, codebase M14)
- Foreground plumbing: which runs per pair, how `sideFrom` receives them, own vs descendant glyphs, nullable `foreground` affects `colorAgrees` and `sideStyles`. (readiness M6)
- Helpers reinvented: parked branch has `boxMask({boxes, area})`, `shareInside`, `eroded`, `pixelHex` in `raster.ts:137-245`. (codebase M10)
- Cherry-pick scope: 56785440c also adds `TOLERANCES.glyphHalo: 1` and touches defs, types, tab.ts, tile.ts, diff.ts, dev-fixture, IT; listed order inverts real parent order (43d653446 precedes 74f4381ae). (codebase M11)
- Wrapped text: each client rect carries the whole string; join duplicates it. (codebase M13)
- Fixture variants: `App.tsx` must alias the new variants to the target layout (`TARGET_ALIASES` in 4e5c87adf) or card titles and `paddingRight` differ; name the recolor hue above `colorDeltaE` and which button; `u1-1280-plain` path. (codebase M15, readiness M9, style 6)
- CUJ 2 "nothing else reported" vs auto-width buttons in a `flex-end` toolbar: `Download` moves siblings; fix width or change the assertion. (codebase M16, readiness N1)
- Acceptance check "fail with the ignore list disabled" has no mechanism; headless Chromium may already render grayscale AA so `--disable-lcd-text` may change nothing; assert the targets differ. (readiness M10, codebase N1, style 7)
- No unit cases for `textDeltas`, `maskedMismatch`, core color, trim. (readiness M11)
- Item 23 names the wrong file (`list.tsx`, plus `fix-prompt.ts`). (readiness M8, codebase M8, style 5)
- "cherry-pick, then adapt" without saying what is kept/dropped (items 15, 21). (style 4)

## Nits

- `src/server/readers/` new folder; other engines live in `src/server/comparators/`. (codebase N4)
- `Row.ownMismatch` must allow `null`; singleton never `destroy()`ed, check wasm workers do not keep vitest alive. (codebase N5)
- Storybook has no design stories; `pnpm test` there proves nothing for the x-ray row. (codebase N3)
- textShadow string differs from 4e5c87adf (`currentColor` per shadow). (codebase N2)
- Style: fragments at 202, 232; "Resolves the open question" (207); 70-word sentence at 222; "No change" entry; line 282 elliptical; line 287 repeats 102 ("casefold" vs "case folded"); "shot"; line 322 six assertions in one sentence; "all green"; duplicate provenance footer. (style 8-18)
