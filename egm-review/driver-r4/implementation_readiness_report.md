# egm-implementation-readiness review: `design-driver.md` revision 4, lines 383–483

Verdict: not ready. Round 3 mostly fixed (headless measurer before the overlay, paddle in the server, `roles-1280` shot, test rule and table, HMR test moved to step 4). Six blockers remain. The spike commits (`16d611003`, `0579e1809`) could not be checked from this worktree.

## Blockers

- **B1. Step 1 removes error codes the frame still throws (item 2 vs 23, 26).** `frame-blocked`, `frame-timeout`, `route-mismatch` are used by `client/frame.ts:81,87`, `client/capture.ts:79`, `client/frame-capture.ts:63`, `tool/steps/diff.ts:71`; step 1 fails typecheck; IT 578 fails. Item 26 deletes `breakpoints.ts` but not its import in `tool/steps/diff.ts:26,295`; nothing removes `breakpoint` from `DeltaSchema` (`defs.ts:83`, `types.ts:137`).
- **B2. The server cannot call the tab outside a tool step (items 17, 33).** `ServerApi` (`packages/extension/src/types.ts:100-110`) has no page or tab field; `ServerToolPageAccess` is built per request (`tool-registry.ts:356-367`). Every HMR or overlay-triggered run depends on this. Fix: add a page caller to `ServerApi` (Modify `packages/extension`, add to gates) or cache the request-bound `page` from the session's last design tool call and define the no-page case. No step implements tab-to-session binding.
- **B3. Typography tested in step 2 but cannot work until step 3 (items 17, 21 vs 22, 236).** The estimate renders in the mirror (item 22); nothing in step 2 calls `estimate` from the run; `type-1280` has no live variant, strings, fonts or sizes; the spike pages use Google Fonts; the either-or assertion. Move estimate and test to step 3 or later; name the wiring file; specify the variant; one expected result.
- **B4. Sample-data rule makes the fixture's identical page never `done` (251 vs 400, 402, 460; IT 508, 1020, 1040).** `Table.tsx:13-20` literal cells (`INV-001`, `INV-002`, `1,200`, `860`) carry warned deltas, so the content count is never zero; `design_status` done is false in 508, 1020, 1040 (not in the table); `bordered` would report `content`, not `paint`. Fix: warnings do not count toward stage or stop, or remove data-shaped literals from the fixture; list the three tests.
- **B5. The pairer cannot be implemented without design decisions (item 29, 231).** Hand weights absent; kind map, geometry normalization, Dice/Levenshtein combination and short-string cutoff, pixel hash to score, source-hint rules unspecified; `pair-spike` and `interp-spike` are not in the repository. Put weights and formulas in the plan or commit the spike code and name its path.
- **B6. `design_measure` breaks the "six design tools" test (item 17 vs row 259).** Client tools share the `design_` defs (`tool/client.ts:5`); a seventh def appears in the catalog. Name the def, file (`tool/client.ts` unlisted), and keep it out of the catalog or update test 259.

## Majors

- **M1. Test rule incomplete (389).** `design_winner` keeps width/height; about 25 `design_target` calls pass `width` (278, 280, 287, 331, 363, 380, 391, 498, 510, 523, 544, 587, 599, 689, 745, 770, 860, 994, 1008, 1022, 1031, 1053, 1063, 1081, 1088) and become excess-property errors.
- **M2. `ClearInputSchema` contradicts itself:** item 2 removes `target`; row 294 says clear takes an id; tests 700, 755, 784 pass `{target: id}`.
- **M3. "Current target" underspecified:** does re-registration make a target current (tests 1008–1088, 498, 510, 523); "switches by name" has no tool argument; row 369 "no target registered" cannot happen with earlier targets in the session and no clear-all; x-ray tests 689, 745, 770 register `u1-390` then diff 1280, new assertions not given.
- **M4. Item 12's consumer list misses `tool/steps/diff.ts:190` (`root.children`), `server/matchers/tile.ts`, `text-groups.ts`.**
- **M5. Text-delta gate has no wiring:** `tool/steps/diff.ts:199-203` builds `text` deltas and is not listed in item 16; shape tests undefined under the no-regex rule; row 400 omits `INV-002`.
- **M6. Fixture variants cannot behave as assumed (items 20, 37):** JSX-switched text is an expression, so `shifted` yields no `text` delta unless the literal sits in a separate JSX branch; `roles` amounts must be expressions; `hardcoded` equals today's `Table.tsx`; which target each test registers is unstated; `bordered` and `grid` need `Table.tsx` changes; `empty`: the fixture has no shared layout, item 42 pins a toolbar on `empty`, empty-page detection unspecified.
- **M7. `Capture` contract change breaks unlisted files:** `server/registries/captures.ts`, `server/registries.ts:35`, `DesignRuntime.capture`, `shared/config.ts:7` (`capture: z.enum(['tab'])`); the client factory takes no config (`define-extension.ts:70-72`, `client.ts:13`).
- **M8. Reused code not reachable:** `collectCssText` (`packages/page/src/css-bundle.ts:12`) and `scrubSensitiveValues` (`element-capture.ts:94`) are module-private; `@conciv/page` exports only `.`; `neutralizeSubtree` lives in `@conciv/protocol/element-capture-sanitize`, not `ui-kit-chat`.
- **M9. `client.ts` to `client.tsx` breaks the build:** `vite.config.ts:7` entry and no Solid plugin, unlisted.
- **M10. `fill` is in `DELTA_KIND_NAMES` (`defs.ts:22`, test 345) but not in the stage table; the exhaustive switch fails.**
- **M11. Target side of `axis` and `columns` never defined (item 31).**
- **M12. Report fields without schema or computation:** the responsive section; `StatusReport.done` from score, stop, `acceptedRun`; the `reregister` status; the step-3 test checks `disagreement` before step 5 adds the field.
- **M13. Nothing implements the carried box (ruling 14) or the heat map data route.**
- **M14. `webfont` woff2 path and license not given; `container` uses Arial so takumi is already off and the subset gate is not exercised.**
- **M15. Skills item:** `skillFile()` emits `name: conciv` with no `## Sources` (`plugin-files.ts:67-79`); say whether `skillFile` gains a parameter; path is `packages/skills/skills/_artifacts/skill_tree.yaml`.
- **M16. Other tests:** `cli/test/cli.test.ts:250-252` target summary; `:360-361` `design target --width 1`.
- **M17. Item 7 leaves the per-session prompt to an unseen branch:** `SystemPromptResolver` gets `{cwd}` only (`types.ts:122-126`); spell out the new signature and caller; add `packages/extension` to the gates.
- **M18. Row 408 imports from a `./raster` export that does not exist.**

## Nits

Gates omit `extension`, `recorder`, `page`, `protocol`. Row 402 pruning count. Item 1 `tab` argument type and `server.ts` wiring. Item 24 wasm route unnamed. Row 403 mirror iframe attributes. `sampledFills` is in `server/deltas/colors.ts:32`, not `raster.ts` (130, 217). Item 38 five-HMR sequence unstated. `fix-sentence.ts` template. Row 397: does `height` stay on `CaptureInputSchema`.
