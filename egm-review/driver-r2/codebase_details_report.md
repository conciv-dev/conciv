# Codebase-accuracy report (Stage 9) — design-driver.md, revision 2

Reviewer: egm-codebase-details (opus), DetailedRange 428–748 plus Open Questions (65–86) as claims. Not ready: 4 Blockers, 15 Majors, 8 Nits.

## Blockers

- **B1. HMR rounds cannot reach the page** (217–225, files 49, 59, 60). Page access is built per tool request (`packages/extension/src/tool-registry.ts:356-371`); `ServerApi` has none (`types.ts:100-110`). Capture (`shared/types.ts:73`), provenance `resolveWinners` (`diff.ts:125`) and `liveRoute` (`target.ts:10`) all need the request-scoped `page`. Needs a core change or rounds stay request-driven.
- **B2. `data-conciv-source` is not unique** (197, file 28, index at 254). One JSX site shares the value across every rendered instance (`Cards.tsx:16` `titles.map(card)`). `componentSelector` already appends `:nth-child(index)` when `shared` (`matchers/tile.ts:34-40`). Reuse that key.
- **B3. The `dom:` fallback and `weak` are dead code** (75, 197, file 28). `collectUnder` collects only attributed elements and flattens the rest (`client/components.ts:166-172`); `source` is a parsed `SourceLoc`, null only on parse failure. File 20 does not change collection.
- **B4. "Existing tests untouched" is false** (file 14, 731). `design.it.test.ts:283` asserts the old target directory is deleted; `:325-327` expects no-route `design_target` to return the live route `/`; `:379-385` expects `route-mismatch` on diff by id; `:274` asserts `limit: 12` against Goal 45.

## Major

- **M1. No HMR settle push** (76, 219, file 49): `hmr-update` is `server.watcher.on('change')` before HMR applies (`packages/plugin/src/core/vite.ts:54`); settle exists only as the pull tool `hmr` on the tab's `import.meta.hot` (`page/src/client/bodies.ts:180-182`, `hmr.ts:43`). Reuse via `page.call` (subject to B1).
- **M2. No x-ray push channel** (225, files 49, 59, 61): `makeXrayRouter` has `targets` and `report` queries only (`xray-routes.ts:17-36`); staleness is `sourceChangedAt` vs `ranAt` (`data.ts:144`). Create an oRPC event iterator or SSE.
- **M3. `playwright-core` is a regular dependency in the recorder** (`recorder/package.json:68`); the browser binary is what is optional (`render.ts:33-40`). The recorder uses `setContent`, never navigates to the app; a separate Chromium has no cookies or auth and rasterizes differently from snapdom.
- **M4. Breakpoint tagging already exists**: `withBreakpoints` (`breakpoints.ts:12-34`, called `diff.ts:295`); `DeltaSchema.breakpoint` is boolean (`defs.ts:83`). Section 3 retypes it to a width without saying so.
- **M5. `Pair` collides** with the tile matcher's pair (`shared/types.ts:103-113`); `Matcher`, `config.matcher: 'tile'`, `sideFrom`/`sideStyles` (`deltas.ts:48-64`) take it. Plan never says whether the matcher is removed, wrapped or kept.
- **M6. Text pairing already exists**: `groupText`/`textDiffers` (`text-groups.ts:197-201`, `TextGroup.owner`) and `diff.ts:199-203`. Files 30 and 38 neither reference nor retire it.
- **M7. `unmatched` overlaps `missing`/`extra`**: `UnmatchedSchema` kinds `missing | extra` (`defs.ts:86-91`, `unmatched.ts:29`), asserted at `design.it.test.ts:338-339, 357`.
- **M8. `medianColor` collides** (`raster.ts:141`, signature `{raster, exclude}`); `edgeMap` (`raster.ts:101`) and `findRegions` (`raster.ts:191`) exist and should be named as reused; `tileMismatch` is private (`tile.ts:44`).
- **M9. Enricher contract**: `Enricher.run({node, raster})` has no page access (`types.ts:37-41`); file 11 does not change it; enrichers run before `put` and pairing.
- **M10. `border` half-specified**: no measurer, `LiveStyles` has no border (`types.ts:45-52`, `components.ts:38-49`); `satisfies Record<DeltaKindName, …>` at `delta-properties.ts:40` will force it.
- **M11. Live `axis` is the parent's flow** (`readAxis`, `components.ts:51-59`), returns `row` for any grid; the container comparison needs an own-axis read file 20 does not add.
- **M12. `capture: 'chromium'` cannot register**: `capture: z.enum(['tab'])` (`config.ts:7`), `Registries.captures` keyed by it (`types.ts:209`), one `capture` in `pickRuntime` (`registries.ts:35`).
- **M13. No `DESIGN_*` env reads anywhere**; config arrives through `boot({config})` (`design.it.test.ts:388`).
- **M14. `TOLERANCES.limit` 12 and `DiffInputSchema` default 12** (`tolerances.ts:15`, `defs.ts:185`) never changed to match the brief.
- **M15. Skill text**: `CONCIV_COMMAND_GUIDE` already has a design bullet (`agent-guide.ts:20`), contradicting Overview line 11; appending leaves two loop rules. `@conciv/skills` has no build script or `harness-init` dependency (`skills/package.json:25-38`).

## Nits

- N1. ppu-ocv 4.0.0 exports `cv`, `Contours`, `ImageProcessor`, `executeOperation`; `threshold`/`canny`/`dilate`/`erode`/`grayscale` are pipeline operation names; `matchTemplate` and `morphologyEx` are raw `cv.*` from `@techstark/opencv-js` 5.0.0-release.1; `Contours#getRect` confirmed; `cv` needs `ImageProcessor.initRuntime()` per worker (`paddle.ts:133`). No new dependency holds.
- N2. `diff` 9 confirmed; ships its own types, so `@types/diff` is redundant; cli pins `^9.0.0`.
- N3. Migration shape confirmed (`gen-migrations.ts`, `db.ts:6,15-18`, WAL, timeout 5000); `packages/db` has no `db:generate` script; whiteboard uses `@libsql/client` folder migrate, so line 248 applies to layout only.
- N4. `tinypool@2.2.0`, `p-queue@9.3.5` transitive only; the package already has two concurrency-1 queues (`paddle.ts:169-173` `serialized()`, `store.ts:98,151-154`); `es-toolkit` has `debounce`. Drop `p-queue`.
- N5. `@typesafe-ai/sdk` absent from every node_modules and the lockfile; API, model, latency and price unverified from source.
- N6. `tanstack_route_manifest` `file` is nullable (`tanstack/src/tool/def.ts:330`).
- N7. The builder already passes `tools` as the 5th argument (`define-tool.ts:99-106`); only the `ServerStep` type omits it.
- N8. `TargetResult.text` renamed to `textRead` silently (`defs.ts:117`); `TargetNode.kind` and `typography.weight` are retypes, not additions (`types.ts:15,19`); `fix-prompt.ts` takes the x-ray `Delta`, not the shared one; stage switch must cover non-kind items; `node:sqlite` needs Node >=22.13 and the design package declares no `engines`.

## Confirmed

`sourceChanges` (`server.ts:41-50`); base64 input (`defs.ts:175`); `frameAtRoute` (`capture.ts:40-43`); `readSite` (`jsx.ts:31`); tolerance names; drizzle catalog `1.0.0-rc.5`; registry shape; fixtures `u1-1280`, `u1-1280-firefox`, `/plain.html`.
