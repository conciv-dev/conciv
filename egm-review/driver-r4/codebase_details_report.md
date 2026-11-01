# egm-codebase-details review: `docs/designs/design-driver.md`, revision 4

Verdict: not ready. 5 Blockers, 19 Majors, 5 reuse misses. Round 3: 4 of 7 blockers fully resolved, 3 partly. Paths under `packages/` unless stated.

## Claims that hold

`Pair` types.ts:103; `Unmatched` types.ts:140; `breakpoint` boolean (types.ts:137, defs.ts:83); `REGISTRIES`/`pickRuntime` registries.ts:15,28; `medianColor`, `boxMask`, `paintOver`, `findRegions`, `crop`, `edgeMap` in raster.ts; `trimToInk`/`differs` in paddle.ts, imported by text-groups.ts:4 and the IT via `./paddle`; paddle.ts Node-only; blazediff.ts:3 loads pngjs via raster; record.json fields store.ts:17-25; diff image masked (diff.ts:228-232, 294), only `live.raster` (293) unmasked; whiteboard `Surface` (whiteboard/src/client.tsx:39-49, define-extension.ts:41,56,149); design client `.ts`, solid-js devDependency (package.json:111); `systemPrompt` static or `(config, {cwd})` (types.ts:124); hmr.ts:43-72 pull-only; rrweb-snapshot 2.2.0 in catalog (pnpm-workspace.yaml:132); rrweb ^2.2.0 in recorder; pretext 1.0.0 in ui-kit-chat; snapdom options capture.ts:99-106; `frameAtRoute` :40; badge strip Toolbar.tsx:32-37; cards flex row card.module.css:1-4; row border styles.css:79; `{props.label ?? 'Export'}` Toolbar.tsx:7; literals Table.tsx:13-20; agent-guide.ts:20; cli.test.ts:314-326; harness-init.test.ts:612; every IT line number exists (two mislabelled, Major 3).

## Blockers

- **B1. The client config channel does not exist (206, 441).** `__client` factory takes no arguments (define-extension.ts:64; host-runtime.tsx:154); config is parsed only on the server (core/src/app.ts:369). A `packages/extension` and core change is needed and unlisted.
- **B2. No page handle per tab; "session" misdefined (206, 225, 433).** `ServerApi` (extension/src/types.ts:100-110) has no page access; `ServerToolPageAccess` is per tool call (tool-registry.ts:356-367, 386-392). The session is `ToolRequest.sessionId`, the conciv session (types.ts:24; IT:147-148 sets `CONCIV_SESSION_HEADER`), not the MCP connection.
- **B3. `sample-data` makes `done` unreachable on the fixture (63, 110, 251, 257, 268, 400).** Design image rendered from the same literals; identical page never finishes; brief empty; tests 508, 1020-1027, 1040-1059 break and are not in the table.
- **B4. Steps 26 and 29 cannot pass their gates.** Step 29 deletes `server/matchers/` but `expand` is imported by text-groups.ts:6, unmatched.ts:3, diff.ts:28; `edge-projection.ts`, `shared/config.ts:5,8` (`geometry`, `matcher` enums), `Comparators.geometry` (types.ts:99) unlisted. Step 26 deletes breakpoints.ts but diff.ts:26,295 imports `withBreakpoints`.
- **B5. Verified assumptions that contradict the code.** `sampledFills` is in `server/deltas/colors.ts:32` (130, 217); `neutralizeSubtree`/`isDangerousTag` are in `@conciv/protocol/element-capture-sanitize` (:73, :99), element-preview.tsx:15 only imports them (140); `collectCssText` (css-bundle.ts:12) and `scrubSensitiveValues` (element-capture.ts:94) are private; element-capture.ts has no widget exclusion (`containsWidget` 193-197 refuses, `blockSelector` null at 72); `data-conciv-source` is not on every element (vite-plumbing.ts:92 skips node_modules; innerHTML content has none, test 1086), weakening CUJ 2's empty definition; `plain-1280` renders from `/plain.html` (render-targets.ts:15), not the `target` variant.

## Majors

1. Stage table has no `fill` (244-249); it is in `DELTA_KIND_NAMES` (defs.ts:22) and `DELTA_KINDS` (deltas.ts:17); the exhaustive switch fails; `fill` is a width ratio (fill-align.ts:7-10) against Non-Goal 79; test 345.
2. `design_measure` joins the catalog, breaks test 259, is agent-visible; `tool/client.ts`, `tool/server.ts`, `DESIGN_TOOL_DEFS` (defs.ts:346) unlisted.
3. Table mislabels 310 and 317: they are `design_capture` tests (height 900, DPR 2); the winner test is 398.
4. `TargetInputSchema` loses `width` but the rule covers only diff, status, capture, winner; 26 `design_target` calls pass width/route; "about 63" is 45 by grep.
5. Clear contradicts itself (415 vs 396); `clearStep` (clear.ts:5-9) also calls `capture.clear`.
6. `CaptureInputSchema` (defs.ts:190-196) and its users unlisted: `targetWidth` (target.ts:45-48), `tabCapture.clear`, `CAPTURE_TIMEOUT_MS` (tab.ts:7,45-47), `toolbarButtons` (IT 915).
7. CLI tests: cli.test.ts:249-252 target summary; :360-361 `design target --width 1` with no tab.
8. `shared/above.ts` missing: `aboveTolerance` counts every unmatched incl. `extra` (above.ts:8-10), drives `status.done` (status.ts:41) and the x-ray; per-component `mismatch` (defs.ts:126) comes from the tile matcher; tests 496, 858, 1029-1035.
9. `UnmatchedSchema` (defs.ts:86-91) and `Row.unmatched` (xray/data.ts:22) touched only at step 40; typecheck fails steps 29 to 40 (r3 B4 still open).
10. `border` has no live side: `LiveStyles` (types.ts:45-52, defs.ts:42-49), `readStyles` (components.ts:38-49), `DELTA_KINDS` (deltas.ts:10-26) unlisted in step 31.
11. Step 39 incomplete: vite.config.ts:7 entry and no Solid plugin; x-ray runtime imports are devDependencies (`@tanstack/solid-router`, `@conciv/ui-kit-system`, `@unocss/reset`, `virtual:uno.css`).
12. Enrichers: `registries/enrichers.ts` not in step 18; `Enricher.run({model, raster})` has no runtime to reach the configured reader, segmenter, rules; OCR failure path (target.ts:40-42) and `TargetResultSchema.text` (defs.ts:117, test 991) have no stated fate.
13. `designConfig.capture` is `['tab']` (config.ts:7) and `Registries.captures` is a server type (types.ts:209); step 25 lists neither.
14. Provenance at another width: mirror sheets from `collectCssText` lose `href` and `data-vite-dev-id` that `describeSheet` needs (winner.ts:39-47); tests 398, 564 assert `viteDevId` and `file`.
15. Skill test impossible: `skillFile()` renders `name: conciv` (plugin-files.ts:67-79); path is `packages/skills/skills/_artifacts/skill_tree.yaml`.
16. Spike sources not in repo: `pair-spike`, `interp-spike`, `pair-site.ts`, `pair-design.ts`, `scripts/loop.ts` (147, 152-168, 479); step 29 ports code with no source.
17. Fixture files missing: `grid` needs Table.tsx; card row CSS is card.module.css; `webfont` needs a woff2 Create; the table already has an `Acme` row.
18. Constants: pairing and estimate numbers (0.08, 0.15, 0.3, IoU 0.3, 3x, 0.6, 0.1, 16 px, 1 px) not in steps 19 or 35; `frameSettleMs`, `captureBudgetMs` (tolerances.ts:16-17) go dead.
19. Settle transport unnamed (server has only `server.bundler`, server.ts:41-50; `extensions/page/src/server.ts` unlisted); `offset` is not a `DeltaKindName` and has no schema (steps 30, 36).

## Reuse misses

`collectComponents` (components.ts:174) works on any Document and should back `dom.ts` and `mirror.ts`; shadow-root walking is a Modify there. `neutralizeSubtree`/`isDangerousTag` from `@conciv/protocol`. `shared/fix-sentence.ts` duplicates `sentence`/`traced` (fix-prompt.ts:3-18): Move. `sampledFills`/`glyphCoreColor` from deltas/colors.ts. `xray/data.ts` `runDiff`/`diffCommand` (163-175) still pass `--target --width`; step 1 does not list it.

## Nits

paddle.ts range is 175-207. `TargetStore` not in `REGISTRIES`, `Capture` is (128). "Test 842" is 835. winner.ts does no target lookup (item 5). frame.ts and frame-capture.ts should be Delete; client.ts:4,7 calls `answerCaptureRequests`. No `./raster` export (row 408). Row 400 omits `INV-002`. Two exported `differs` after the move (insets.ts:17). harness-init gate lacks `pnpm test`.

## Round 3 blockers

B1 mostly resolved (range wrong, row 408 contradicts step 13). B2 partly (transport unlisted). B3 resolved by ruling 20. B4 partly (Major 9). B5, B6, B7 resolved. Majors: M1 partly (Major 11); M2 fails on the config channel (B1); M3 fails on `expand`, `edge-projection`, `mismatch` (B4, Major 8); M4 partly (Major 12); M5 partly (B5); M7 partly (Major 6); M8 partly (B3, Majors 4, 7); M10 now a step 26 gate failure (B4); M12 unchanged (takumi uninstalled, unverified).
