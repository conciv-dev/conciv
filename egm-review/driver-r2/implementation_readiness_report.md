# Implementation readiness report (Stage 9) — design-driver.md, revision 2

Reviewer: egm-implementation-readiness (opus), DetailedRange 428–end with the feature text for context. Checked against `packages/extension`, `packages/protocol`, the design extension, `packages/it/test/design.it.test.ts`, the fixture host, `packages/skills`.

**Verdict: NOT READY.** 7 Blockers, about 20 Majors. Several steps' tests cannot pass at their own commit or cannot be written against the fixture host. "Existing tests untouched" is false for at least four cases.

## Blockers

- **B1. Rounds without a tool call have no page handle** (items 49, 55, 59, 60; lines 223, 634, 674). Every client call goes through `ServerToolPageAccess`, built per tool request (`packages/extension/src/tool-registry.ts:356-371`); `ServerApi` (`types.ts:100-110`) has no page caller. HMR rounds, x-ray marks, `xray.capture`, provenance `resolveWinners` and `xrayUrl(session)` all need a request. Say where a round gets page access and a session (cache the last handle, add a core API, or other).
- **B2. The "x-ray's existing channel" does not exist** (49, 59, 61; 225, 634, 674, 685). No push from the design server to the x-ray: no `report-updated`, no oRPC event iterator, no SSE; the x-ray polls `xray.report` and reads `sourceChangedAt` on reload. Define transport, procedure and payload.
- **B3. Step ordering** (39 vs 44, 54). Step 3 tests expect `via: 'verified'`, `extra`, `moved`, but verification and the first pairing join `targetStep` only in step 4 and per-round pairing in step 5; no report field exposes pairs until step 5. Move wiring and schema fields into step 3 or move the tests.
- **B4. Route test contradicts the convention table and the fixture** (48; 628). The walker looks at `src/routes`, `src/pages`, `app`, `pages`; the host has `src/{App,Cards,Table,Toolbar,main}.tsx`, `index.html`, `plain.html`, so the result is `none`, not `/` and `/plain.html`. "`intent: 'build'` and `route: '/'` returns `needs-route`" contradicts section 1.1 and CUJ 2.
- **B5. The badge is not an element** (39, 59, 66; 591, 674, 703). In `Toolbar.tsx` the badge is a `backgroundImage` gradient on `<header>`, so "badge reported as `extra`", "`badge` variant reports `stage: 'structure'`" and "pairing the badge by hand" cannot hold. Needs a variant with a real extra element.
- **B6. Referenced fixture content does not exist** (66, 59; 703, 674). No footer in the host; `u1-1280-firefox` has no photo region; the step 5 test applies an `image-slot` mark that only exists from step 6.
- **B7. Roles tests point at the wrong side** (26, 39; 537, 591). All images render `?variant=target` ("Acme", "1,200"); item 27 adds a `roles` variant but no `u1-1280-roles` shot, so `[Customer Name]` can never be a target node with `placeholder`. Under the rules engine "Acme" is `literal`, so a `text` delta fires, the opposite of the assertion. Name the shot and which side carries expressions.

## Major

- **M1. Existing tests break** (1/14; 488): `design.it.test.ts:379-385` expects `route-mismatch` on diff by id (removed by section 9, item 48); `:995-999` reads `model.json` and `registered.text.runs` (gone after step 1; item 43 introduces `textRead`); `:564-569` expects `breakpoint: true` (becomes `<width>`; `breakpoint` already exists as boolean at `defs.ts:83`); `:1026/1058` assert `done` after one diff (item 56 redefines). List every changed test.
- **M2. Step 1 typecheck gate cannot pass** (11; 476): `TargetNode` reshape and the five new `Registries` slots land in step 1 but their implementations in steps 2–5; `adapters/image.ts`, `target.ts`, `diff.ts` (`root.children`), `matchers/tile.ts` break. Split type changes per step.
- **M3. `Pair` name collides** with `shared/types.ts:103` (tile matcher pair used across `diff.ts`, `deltas.ts`).
- **M4. `Enricher` contract cannot carry the new enrichers** (15–18, 21, 22): today `applies(node)`/`run({node, raster})` recursed into every child; text is root-scoped; estimates needs page access, the hidden frame and a pair that does not exist at registration; roles needs the engine and the whole list; "per round" vs registration. Define the signature and when estimates runs.
- **M5. No components-only client mode** (49, 46): `captureStep` always runs snapdom; when requested width equals tab width `needsFrame` is false and the tab is captured (`client/capture.ts:85-97`), so "diff by id while the tab shows `/plain.html`" captures plain.html unless a route mismatch forces the frame.
- **M6. Tile matcher outputs unspecified in a raster-less round** (49, 55): `mismatch`, `diffImage`, `livePath` (required in `DiffReportSchema`), `unmatchedRegions`, tile gating; `residualShare` never refreshed so `done` unreachable.
- **M7. `EventSchema` payloads undefined** except `edit` (10); `inverse` unspecified; cursor semantics over `pair` events undefined.
- **M8. Nothing calls `carryNodes`** (28).
- **M9. Responsive grouping assigned to no item and no test.**
- **M10. Delta kinds vs stage table** (34, 50): `border` has no measuring kind; `unbuilt`/`extra`/`missing`/`moved` are stage items but not kinds, so the exhaustive switch needs an item union; `pair` and `demoted` shapes unspecified.
- **M11. Equal-string literal-vs-data ambiguity** (38): table cells "INV-001", "1,200" are JSX literals reading as `data`; if equal strings fire, `text-changed` no longer reports exactly one delta.
- **M12. A 40px shift cannot report `moved`** (39) with `verifyWindow` 24.
- **M13. No surface to read nodes in step 2 tests** (26): `TargetResult` carries no nodes and `model.json` is gone.
- **M14. Fake adapter raster path** (24/25): `render-targets.ts` writes to a per-boot `mkdtemp`; a committed JSON cannot hold a valid PNG path. `DESIGN_FAKE_ADAPTER`/`DESIGN_ENGINE`: config fields or `process.env`? `DesignConfig` has no env mapping.
- **M15. Legacy-import test has no seeding hook** (14): `boot` creates its own `mkdtemp` stateRoot (`design.it.test.ts:123-125`); the "unless asked" flag on `find` is unnamed.
- **M16. Route-to-file map never stored** (12/49/51): `hmr-update` gives `file` only; `targets` has no route-file column; user-named routes never resolve a file; settle is client-side on the tab, not the frame.
- **M17. Width rule unclear** (44): `adapter.load` already needs `width` to scale; triple-negative `needs-width`; interaction with the `u1-2560` retina test unspecified.
- **M18. Edit test cannot change the page** (59): switching the variant default does not affect `?variant=badge`; edits a committed fixture; name the edit, the revert and the expected stop.
- **M19. "The server's own patch path" is not an API** (66).
- **M20. `@conciv/skills` has no build script, generator or `harness-init` dependency** (70; 739).
- **M21. Chromium capture not wired** (47): `capture: z.enum(['tab'])` unchanged; `Capture` has no `clip`; no session or cookies.

## Nits

- Item 7: deleting `server/store.ts` also breaks `xray-routes.ts:9` (`TARGET_FILE`) and `breakpoints.ts`.
- Item 34: `LiveComponentTreeSchema` in `captures/tab.ts` also needs `columns`.
- Item 13: enum member names not given.
- Item 10: `typography.weight` number to enum not called out; affects `deltas/typography.ts` and live `fontWeight`.
- Items 1/2: `diff` 9 ships its own types; cli pins `^9.0.0` directly.
- Item 73: named snapshot tests do not exist; `harness-init/test/harness-init.test.ts` and `cli/test/cli.test.ts` contain-match.
- Item 48: "`verification.present` equal to the component count" (which count); `textRead.cached` not in item 43's schema.
- Line 248 vs item 6: whiteboard uses libsql plus a folder migrator; item 6 correctly follows core.
