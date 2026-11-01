# Implementation Readiness Report, round 2

**Target:** `/Users/omrikatz/Public/web/aidx-text/docs/superpowers/specs/2026-11-01-design-text-layer.md`, lines 220-352 (lines 1-219 read for context)
**Checked against:** `packages/extensions/design/src`, `packages/it/test/design.it.test.ts`, `packages/it/test/fixtures/design`, `pnpm-workspace.yaml`, the design `package.json` and `tsdown.config.ts`, `packages/extension/src/define-tool.ts`, and the parked worktree `aidx-659` (which the plan names as a source).
**Verdict:** not ready.

## Answers to the five questions

1. **Can each commit be done without design decisions?** No. Commit 1 can. Commits 3, 4 and 5 each still leave at least one design decision (B2, B4, M1–M3, M5, M7–M9, M11).
2. **Does each commit build on its own?** Commit 1 fails typecheck (B3). Commit 3 fails typecheck (B4). Commit 4 builds but fails the IT gate, because it breaks the `text-recolor` test added in commit 1 (B1). Commits 2, 5 and 6 build as listed.
3. **Files touched but not listed:**
   - `server/enrichers/color.ts` (commit 1)
   - `fixtures/design/host/src/styles.css` (commit 1)
   - `src/server.ts` and `server/registries/text.ts` (commit 3)
   - `shared/types.ts` for the `Matcher` and `Group` types (commit 4)
   - the `DeltaLine` JSX in `list.tsx` (commit 5)
   - A unit-test location for new pure code, which the package doesn't have today.
4. **Is the commit 4 renderer change specified enough?** No (M11, M12, M13).
5. **Is `ocr-failed` consistent with `toolError` and `DESIGN_ERRORS`?** No (B4).

## Blockers

**B1. Commit 4 hides a recolored label, so CUJ 3 and the commit-1 test fail from commit 4 on.**

- Where: lines 127 and 129 (Step 5), 243, 297, 300.
- Problem: groups "agree" on string equality alone. `text-recolor` renders "Export" in `#ffd166` and OCR reads "Export", so the group agrees. Its glyph boxes go on the ignore list for the button and for the header (descendants are included). Both tiles drop below `tileGate`, nothing is reported, and no `foreground` delta is produced.
- This is the first attempt's failure mode described at line 40. The same happens to a font-size or weight change on an unchanged string.
- Fix: a group agrees only when the strings are equal **and** the glyph-ink colors on the two sides are within `colorDeltaE` (use the Step 1 estimator on the group's boxes). Otherwise its pixels stay in the diff.

**B2. Grouping needs the matcher's pairs, but is run before the matcher.**

- Where: lines 117, 119, 297, 303.
- Problem: item 21 takes `pairs` so it can shift runs by `targetBox - liveBox`. Item 23 computes groups "after the capture" and passes them into the matcher, when no pairs exist yet.
- Inside the matcher, `tileMismatch` runs before `estimateTarget` (`tile.ts:86-95`), so a target box is never known at masking time either.
- Fix: decide explicitly. One option: mask using groups built in the live frame with no shift, then rebuild groups with pairs in `diff.ts` for the text delta. The other: build groups inside `matchPairs` from the parent's `targetBox`.

**B3. Commit 1 does not typecheck.**

- Where: line 231.
- Problem: `foregroundColor` becomes `string | null`, but `server/enrichers/color.ts:13` puts its result into `TargetNode.fills.foreground?: string`. The store schema `foreground: z.string().optional()` (`store.ts:34`) would also reject a stored `null`.
- Fix: add the file to commit 1 and leave `foreground` out when the result is `null`.

**B4. The `ocr-failed` path doesn't type-check and contradicts the Risks section.**

- Where: line 289, against line 192.
- `toolError(code, {message?, data?})` (`define-tool.ts:47`) has no `cause` field, so `{cause}` is an excess property and fails typecheck.
- A `ToolError` that is built but not thrown does nothing. `ServerApi` (`extension/src/types.ts:100-110`) and `DesignRuntime` have no logger, and the design package never uses `console`.
- `DESIGN_ERRORS` lists the errors a tool throws. Adding a code that is never thrown declares a failure that cannot happen.
- Line 192 says the error is "reported by the tool"; line 289 says it is "logged, not thrown". Both cannot be true, because `TargetResultSchema` has nowhere to put a warning.
- Fix: don't add it to `DESIGN_ERRORS`. Instead add an optional field to `TargetResultSchema`, for example `text: {runs: number; error?: string}` (`DiffReport.hint` at `defs.ts:132` is a precedent). Return it, and have the item-20 test check `runs > 0`.

## Major

**M1. Reader shutdown is not wired to anything (line 286).**

- The shutdown hook is `dispose` in `src/server.ts:65`, which currently returns only `css.dispose`. That file is not listed.
- `TextReader` has no `destroy`, and the registries are module-level, so the plan must say how `server.ts` reaches the reader.
- The reader is one per process, but `dispose` runs once per server. The IT file starts a second server in the same process (`design.it.test.ts:370-379`). `other.dispose()` would destroy the reader the first server still uses, unless `destroy` also resets the singleton so the next read starts a new one.
- `registries/text.ts` (replacing the stub from item 15) is also missing from commit 3.

**M2. Concurrent registrations are not serialized.**

- Line 196 says the store's write queue serializes `design_target` calls. OCR runs in `targetStep` before `store.put` (`target.ts:39-46`), outside that queue (`store.ts:151-155`).
- Fix: specify a stored init promise for the session and a queue for reads.

**M3. The code to port is not reachable when commit 3 needs it.**

- `wasm-service.ts`, `trim.ts` and the spike doc arrive in commit 6, "from the session scratchpad", with no path (lines 342-343). Item 18 ports from them in commit 3.
- The plan also never says which `onnxruntime-web` entry to import, how its wasm file is found (`ort.env.wasm.wasmPaths`), or how `models/` is found at runtime from `dist/`.
- Suggestion for `models/`: resolve `@conciv/extension-design/package.json` with `createRequire`; that path is already exported (`package.json:53`).
- Move the spike doc to commit 1 with a real path.

**M4. `onnxruntime-node` may still reach every user (line 280).**

- `ppu-paddle-ocr`'s main entry imports `onnxruntime-node`. If ppu lists it as a regular dependency, it installs for everyone who installs `@conciv/it`.
- `allowBuilds: onnxruntime-node: false` (`pnpm-workspace.yaml:199`) only blocks its install script, and only in this repo. That contradicts lines 202 and 180-181.
- Could not confirm because ppu is not in the lockfile. The plan must state ppu's dependency type for `onnxruntime-node` and how it is kept out.

**M5. Band slicing is undefined (lines 195, 286).** The overlap height, the duplicate rule (what overlap counts as a duplicate) and which duplicate is kept are not given.

**M6. Commit 4 changes types without listing the file (line 300).** "`Matcher.match` input gains `groups`" changes `shared/types.ts:102-110`. The `Group` type also has to live in `types.ts` so the shared types don't import from a server module. `tileMismatch` also needs the component passed in, not just a box.

**M7. Item 22 contradicts Step 5 on the denominator (line 300 against line 127).** The parked `shareInside` (`aidx-659 raster.ts:245-251`) divides by the number of pixels in the region, not by the tile area. Specify "differing pixels outside the ignore mask divided by tile area". A simpler route: copy target pixels into the live crop under the mask before comparing.

**M8. False text deltas for old targets (lines 119-123, 129, 297).** The plan doesn't say whether a component whose glyphs match no target runs has a group. If it does, commit 5 emits `{live: 'Export', target: ''}` on every reported text component of an old target, which breaks CUJ 5, and on every OCR miss. State: no group when the target side is empty.

**M9. The `text` delta never gets a source location or a fix prompt (lines 133, 320, 326, 329).**

- With `DELTA_PROPERTIES.text = []`, `attribute()` leaves the delta without provenance (`diff.ts:138-156`).
- `fixPrompt` only keeps deltas with provenance (`fix-prompt.ts:3-5, 20`), so the item-31 sentence never appears.
- Line 133's "provenance shows the component's source location" has no mechanism, and `Provenance.via` has no value that fits.
- Also unspecified:
  - Whether the delta is appended inside the `.map` before the report filter (`diff.ts:191-211`). It should be.
  - How the strikethrough is rendered: `DeltaLine` prints plain text from `deltaSentence` (`list.tsx:106-136`).

**M10. The commit-1 foreground test probably fails, and line 210 is wrong.**

- Line 210 says `glyphCoreColor` and `eroded` are reused "as noted in the plan", but the plan never mentions them.
- Without erosion, the median of every pixel with ΔE > 3 from the background includes the anti-aliased edge pixels around 16px Arial strokes.
- The item-5 check, "`target` within `colorDeltaE` of `#ffffff`" (line 243), is then unlikely to pass.
- Fix: specify erosion as the parked `glyphCoreColor` does (`aidx-659 deltas/colors.ts:17`), or loosen the check.

**M11. The renderer precondition cannot be implemented as described (line 309).**

- `renderTargets` returns `void` (`render-targets.ts:29`), and "records" doesn't say how: a return value or a file.
- Not stated: where the first button's box comes from, or which comparator, blur and `tileMargin` reproduce "raw" tile mismatch.
- The IT test cannot import `tileMismatch`: the design package doesn't export it (`package.json:23-53`), and `packages/it` doesn't depend on `@blazediff/core`.
- Also unstated: the path, ready selector and viewport for `u1-1280-grayaa`.

**M12. The grayscale test will likely fail on the input field (line 312).**

- `<input placeholder="Search invoices">` (`App.tsx:11`) has no DOM text, so by Non-Goal line 54 it stays in the pixels. Cross-renderer noise is then likely to push that input above tolerance, so `status done` would fail.
- "Diffed against the normal page" must mean `goto('target')`. The `/` page has the paddingRight inset delta (`design.it.test.ts:312-319`).
- Fix: limit the assertion to the toolbar, or say how the placeholder is handled.

**M13. CUJ 1 may never be checked on CI (line 312).** If headless Chromium already renders grayscale anti-aliasing, the precondition skips the test and the main goal goes untested. On CI the test should fail rather than skip, or use a flag known to change glyph rendering on Linux headless.

**M14. Item 20's box check depends on test order (line 292).** "The first button's live box from a subsequent diff" works only if that button is reported, which depends on which page the previous test left open. Use `design_capture` on the `target` variant, as lines 284-289 of the test do.

**M15. No unit tests for the new pure code.**

- Not covered: `groupText` (reading order, wrapped lines, case folding, an empty side), `trimToInk`, the `null` foreground path, and the mask denominator.
- The design package has no test setup, so the plan must say where these tests live. Round-1 M11 is still open.

**M16. The real-export check is not assigned to any commit (line 350).** The export is made by hand, and the fallback decision is put off until "before release".

## Nits

- **N1.** Item 6 (line 246) doesn't list `styles.css`, which it edits, and doesn't give the CSS selector for the first button. 96px is too narrow for "Download": about 71px of text plus 32px padding overflows the button. 112px or more fits.
- **N2.** Item 4 (line 240) changes nothing: `colorAgrees` reads only `.background` (`tile.ts:65-71`). Line 96 is wrong for the same reason.
- **N3.** Item 14: `xray/dev-fixture.ts` builds no `LiveComponent` values (it builds `DiffReport` rows), so there is nothing to change there.
- **N4.** Item 10: reuse the existing `ownTextNodes` (`components.ts:59-63`) instead of adding `glyphNodes`.
- **N5.** `boxMask` is added in commit 1 but unused until commit 4, so fallow will warn about an unused export. Add it in commit 4.
- **N6.** Importing `ciede2000` directly bypasses the configured `color` metric. Say so, and cache the per-pixel distance as the parked code does.
- **N7.** Check the three pins against `minimumReleaseAge: 2880` (`pnpm-workspace.yaml:209`), and note the second `onnxruntime-web` copy next to `1.26.0-dev`. The tsdown `external` entries are redundant, because dependencies are already external.
- **N8.** Lines 193 and 351 say a moved ppu file "fails the build". It actually fails an IT test.
- **N9.** Spell out `TARGET_ALIASES` per commit:
  - commit 1: `badge`, `text-recolor`
  - commit 4: add `textnoise`, `badge-textnoise`
  - commit 5: add `text-changed`

  Copying 4e5c87adf's list as is also brings in the unused `badge-recolor`. Separately, line 194 (outside the range) cites adapter size limits that `adapters/image.ts` does not have.
