# Codebase Details Review, round 2: design-text-layer, lines 220-352

Scope: /Users/omrikatz/Public/web/aidx-text/docs/superpowers/specs/2026-11-01-design-text-layer.md (lines 1-219 read for context). Standard: implementation-readiness-standard.md.

Note: the reviewer could not run `git show --stat`. The four parked commits and what they do were confirmed from the reflog at /Users/omrikatz/Public/web/aidx/.git/worktrees/aidx-659/logs/HEAD, and the helpers were read from the aidx-659 working tree (branch design-text-mask). Which commit introduced each helper is inferred from commit messages, not per-commit diffs.

## Confirmed correct

- On the parked branch, `glyphBox` is at client/components.ts:91, `boxMask` at raster.ts:231, `shareInside` at raster.ts:245, `eroded` at raster.ts:143, `glyphCoreColor` at deltas/colors.ts:17, `TARGET_ALIASES` at App.tsx:5, `TEXT_NOISE` at Toolbar.tsx:22, and `glyphHalo: 1` at tolerances.ts:10. Parked tab.ts:15 is `glyphs`, and the parked test line 217 is `glyphs: []`.
- The reflog confirms the commit order a5ef8054e → 56785440c ("glyph boxes are masked…") → 43d653446 ("foreground estimator samples glyph cores…") → 74f4381ae → 4e5c87adf ("test(it): text noise cases"). These messages match where the plan sources glyphHalo and the collector (56785440c) and TARGET_ALIASES / TEXT_NOISE (4e5c87adf).
- Main has `foregroundColor`, `medianColor` and `encodePng` (raster.ts:151/136/11), `sampledFills` (deltas/colors.ts:11), `sideStyles` (deltas.ts:48), and `colorAgrees` and `tileMismatch` (matchers/tile.ts:65/43).
- `TextReader` exists and is `null` (types.ts:84, registries.ts:38). `DELTA_KIND_NAMES` is at defs.ts:15, `DELTA_PROPERTIES` uses `satisfies Record<DeltaKindName,…>` (delta-properties.ts:39), and `KIND: Record<DeltaKindName,…>` is at list.tsx:31.
- `componentAboveTolerance` is at shared/above.ts:4 and `measureTextBox` at client/components.ts:65. `mapFixture`'s LiveComponent literal is at design.it.test.ts:216-226. Package `@conciv/it` exists, and `fallow` is a root devDependency.
- The spike pins match: ppu-paddle-ocr 6.6.1, ppu-ocv 4.0.0, onnxruntime-web 1.31.1. Under Node, `import * as ort from 'onnxruntime-web'` resolves to `./dist/ort.node.min.mjs`. ppu-paddle-ocr's `processor/platform.node.js` imports onnxruntime-node.

## Blockers

1. **Lines 109 and 286: `createRequire(import.meta.url).resolve('ppu-paddle-ocr/package.json')` will throw `ERR_PACKAGE_PATH_NOT_EXPORTED`.** The ppu-paddle-ocr 6.6.1 exports map has only `.`, `./web`, `./mobile` and `./coi-serviceworker.js`. There is no `./package.json` entry. The spike never used this route; wasm-service.ts:6 hard-codes `new URL('./node_modules/ppu-paddle-ocr/', import.meta.url)`. Use `dirname(require.resolve('ppu-paddle-ocr'))` instead: `.` exports `default: ./index.js` at the package root.
   - Also on line 109, "exposes only `.`, `./web` and `./mobile`" is wrong; `./coi-serviceworker.js` is also exported.

2. **Line 300 (item 22): `shareInside` does not keep the denominator at the tile area.** Parked raster.ts:245-251 divides by the count of region pixels equal to `wanted`. With `inside: false` (the "complement" the plan describes), that is the unmasked area, not the tile. This contradicts Step 5 (line 127): "the denominator stays the tile area, so `mismatch` keeps its meaning". Copying `shareInside` as instructed changes what `mismatch` means and inflates it as masking grows. The plan needs a different formula: differing unmasked pixels divided by `tile.w*tile.h`.

3. **Lines 119, 297 and 303 (Step 4, items 21 and 23): the text groups depend on pairs that do not exist yet.** `groupText({components, runs, pairs})` translates by `targetBox - liveBox` "when the matcher has a target box". But item 23 computes the groups after the capture and passes them into `matcher.match`, which is where the pairs are created. In tile.ts:86-95, a component's `targetBox` is only estimated after its own `tileMismatch`, and only when that mismatch is above the gate. So the translation can never feed the mismatch that uses it. The implementer has to pick the order: groups inside `matchPairs` per level, a two-pass match, or live-box-only grouping. That is a zero-decision failure.

4. **Lines 96 and 240 (item 4): the plan says `colorAgrees` uses the foreground color, but it does not.** tile.ts:65-71 compares only `pair.live.styles.background` against `sampledFills(...).background`. It never reads `.foreground`, so "a `null` foreground on either side agrees" describes behavior that does not exist, and line 96's "fixes consequence 1 for every caller (`sideStyles`, `colorAgrees`)" is false for `colorAgrees`. Drop item 4, or say there is no change.

## Majors

5. **Line 271 (item 14): `src/xray/dev-fixture.ts` builds no `LiveComponent` literals.** It builds `DiffReport` and `TargetRecord` objects only. The only `LiveComponent` literal in the repo outside the collector is design.it.test.ts:216 (`mapFixture`). Remove dev-fixture.ts from item 14.

6. **Line 292 (item 20): the test at line 266 does not read model.json.** design.it.test.ts:266 only checks `existsSync(fileUnder(stateRoot, '.conciv/design/<id>'))`, and no test reads model.json. The path pattern `.conciv/design/<id>/model.json` (store.ts:13, 139) is real, but the precedent the plan points to does not exist.

7. **Line 289 (item 19): the error handling cannot be written as specified.**
   - `toolError` is `(code, {message?, data?})` (packages/extension/src/define-tool.ts:47); it has no `cause` option.
   - "Logged" has no destination: `ServerApi` and `DesignRuntime` expose no logger.
   - Not throwing also contradicts Risks line 192 ("reported by the tool as an `ocr-failed` error"). `TargetResultSchema` (defs.ts:105) has no field to carry a warning.
   - The plan must choose between a throw after storing, a new output field, or a console write.

8. **Line 286 (item 18): "the server's shutdown hook" is `dispose` in `ServerResult`, which src/server.ts:65 sets to `css.dispose` today.** The plan must list src/server.ts as Modify and compose the two disposers. Today it is missing from the Commit 3 file list.

9. **Lines 133, 326 and 329 (Step 6, items 30 and 31): text deltas will never reach the fix prompt.** `DELTA_PROPERTIES.text` returns `[]`, so `attribute()` (diff.ts:138-156) adds no `via`/`file`. `fixPrompt` (fix-prompt.ts:19-21) keeps only deltas where `traced()` is true, which needs `via` and `file`. So the fix-prompt sentence in item 31 is never emitted, and `DeltaLine` shows no source link. "Provenance shows the component's source location" (line 133) is not something the code does. The plan must change `traced`/`fixPrompt`, or set `via`/`file` from `pair.live.source`.
   - Also, `KIND` entries require `measure: 'px'|'share'|'plain'` (list.tsx:29-31); "no measure" is not representable. It should say `'plain'`.

10. **Lines 100 and 259-260 (Step 2, item 10): the parked collector does not match the plan's description.** Parked `glyphNodes` (client/components.ts:82-89) recurses into non-component child elements; it is not "direct text-node children". Copying it, as item 10 says, changes the semantics Step 2 defines. Main's `ownTextNodes` (components.ts:59) is the direct-children version.
    - Parked `glyphBox` already applies `glyphHalo` (lines 93-96), so "grow by `glyphHalo`" on top of it doubles the halo.
    - The parked code types `view` as `Realm` and uses `view.Text` instanceof checks; main uses `Window` (components.ts:86).

11. **Line 263 (item 11): parked tab.ts:15 is `glyphs: z.array(BoxSchema)`, a box list, not text runs.** The plan's type is `TextRun[]`, so that line cannot be copied as is. Say it must use `TextRunSchema`.

12. **Line 312 (item 26): "`u1-1280-grayaa` diffed against the normal page" would not pass.** The target is shot from `/?variant=target` (render-targets.ts:12). The default page `/` differs from it by an `inset-right` delta (design.it.test.ts:312-319), so diffing against `/` cannot reach `done`. The live page must be `?variant=target` or one of its aliases.

13. **Line 309 (item 25): render-targets.ts has no comparator or blur.** It imports only pngjs, playwright and vite, and it does not know the first button's box. "Records the raw mismatch of the first button tile" leaves open which comparator and which blur, how the box is found, and where the result is stored for the test to read.

14. **Lines 280-283 (items 16 and 17): no path is given for loading the vendored `models/` at runtime.** The server is bundled into `dist/server.js` (tsdown.config.ts:4), so a `new URL('../models/…', import.meta.url)` path differs between src and dist. No resolution rule is given.

15. **Line 231 (item 1): `boxMask` is added in commit 1 but not used until commit 4.** That unused export will probably fail the `fallow audit … 0 errors` gate on line 224. Move it to commit 4.

## Nits

16. **Line 231:** "reuse the `ciede2000` comparator's distance". `foregroundColor` in raster.ts has no access to `comparators`. The plan should name the import: `ciede2000` from server/comparators/ciede2000.ts, or culori `differenceCiede2000`. The metric also parses hex strings, which is expensive per pixel.

17. **Line 234 (item 2):** the `foreground` kind already returns `[]` on `undefined` (deltas/colors.ts:25). Since item 3 never sets `color: null`, the `null` branch is a no-op, and `Partial<LiveStyles>.color` cannot hold `null` anyway.

18. **Line 269 (item 13):** `put` already persists every model field except the raster, via `...rest` (store.ts:135-139). Only `ModelSchema` needs a change.

19. **Line 280 (item 16):**
    - `onnxruntime-node: false` sits under `allowBuilds` (pnpm-workspace.yaml:199); name the key.
    - tsdown already externalizes `dependencies`, so "the three packages external" is redundant.
    - The root lockfile already resolves `onnxruntime-web@1.26.0-dev.20260416-b7804b056c` and `onnxruntime-node@1.24.3` through `@huggingface/transformers@4.2.0` (pnpm-lock.yaml:19635-19640). Pinning 1.31.1 installs a second copy; the plan should say so.
    - `minimumReleaseAge: 2880` applies to the three new pins.

20. **Line 109:** the spike imports `CanvasProcessor` and `CanvasToolkit` from `ppu-ocv/canvas`, not `ppu-ocv` (wasm-service.ts:3-4). `parseDictionary` comes from `utils.js`, not `core/` (line 11). The spike also assigns `service.detector`, `service.recognitor` and `charactersDictionary` (lines 40-42), which "assigns the sessions" leaves out.

21. **Lines 246 and 306 (items 6 and 24):** parked `TARGET_ALIASES` also contains `badge-recolor`, which needs Toolbar's `RECOLOR` (parked Toolbar.tsx:26). The plan does not say whether to drop it. The first button has no class or selector to hang `width: 96px` on in styles.css (the `button` rule at line 38 applies to all buttons).

22. **Line 300 (item 22):** changing the `Matcher.match` input means editing `shared/types.ts` (types.ts:102-110), which is not listed in Commit 4. The `Group` type has no stated home.

23. **Line 210 (context):** `glyphCoreColor` and `eroded` are "reused as noted in the plan", but no plan item uses them; Step 1 replaced that approach.

24. **Line 323 (item 29):** accurate, but `DELTA_KINDS` lives in server/deltas.ts:10 and registries/delta-kinds.ts only re-exports it.

25. **Line 196 (context):** the store queue (store.ts:151-155) serializes only `put`. The OCR `read` runs before `put` in target.ts, so concurrent registrations are not serialized through the singleton.

26. **Line 222:** the four commits sit on a5ef8054e, confirmed by the reflog.

27. **Line 202 (context):** ppu-ocv also brings `@techstark/opencv-js`, which is missing from the footprint.
