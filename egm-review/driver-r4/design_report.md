# egm-design review: `docs/designs/design-driver.md` revision 4, lines 1–382 (feature-spec standard)

Code checked: `packages/extension/src/{types.ts,tool-registry.ts}`, `packages/core/src/{tool-registry.ts,page-bus.ts,api/mcp.ts}`, design `server.ts`, `tool/client.ts`, `client/capture.ts`, `server/store.ts`, `shared/types.ts`, `packages/page/src/{element-capture.ts,css-bundle.ts}`, `packages/protocol/src/element-capture-sanitize.ts`, rrweb 2.2.0 dist (Replayer, Timer). Nothing under r3 "Not adopted" re-raised.

## Verdict

Changes required; not ready to implement. All standard sections present; rulings 14 to 20 folded in consistently. Three blockers: the server-to-tab channel rests on an extension API handle that does not exist and a binding model the page bus cannot express; the mirror's Replayer applies mutations on `requestAnimationFrame` and has no sync point, reviving Problem 3; the pairing vote is not implementable from the text and its spike code is not in the repository. Majors: stop rules misfire, the empty-page switch hides the unbuilt remainder, sample-data blocks `done`, typography mis-sequenced.

## Round 3 status

B1 resolved (ruling 15; new stop defects M1, M2). B2 resolved in text; snapdom-of-mirror fidelity unmeasured (M7). B3 replaced by the vote, not implementable (B3). B4 **not resolved** (B1). B5 partly (M8). B6 resolved within ruling 16. B7 partly (M4). M3 named, new failure modes (B2, M6). M5, M6, M8–M11, M13–M15 resolved. M7 not re-raised. N4 defined but not computable (M2).

## Blockers

### B1. `design_measure` channel and session binding do not exist as stated (206, 210, 225, 276)

- No page handle outside a tool call: `ServerApi` (`packages/extension/src/types.ts:100-110`) has none; `ServerToolPageAccess` is built per tool call (`tool-registry.ts:356-367`). HMR and overlay triggers cannot reach the tab.
- A session is not an MCP connection: the transport is stateless (`core/src/api/mcp.ts:250-266`); a session is the conciv `SessionId` from `CONCIV_SESSION_HEADER` (`mcp.ts:33-38`).
- Tabs are not addressable: the widget subscribes per `SessionId` (`page-bus.ts:99-106`); `ask` sends to every subscriber and takes the first reply (`page-bus.ts:117-119`). "The registering tab answers" cannot be expressed; with `assertLiveRoute` removed a tab on another route can answer.
- Default `ask` timeout 5 s (`page-bus.ts:115-116`) is too short for mirror layout plus snapdom plus type renders.
- Client tools are agent-visible (`tool-registry.ts:351-353`): `design_measure` becomes a seventh catalog tool with multi-megabyte output.

Fix: core change `ServerApi.page.ask({sessionId, name, input, timeout})` in `packages/extension` and `packages/core`, called with `record.session`; a per-tab id on the subscription and `PageQuery`, or "any tab of the session answers" plus a route check; define what an `hmr-update` (no session) runs; hide `design_measure` from the catalog; explicit timeout.

### B2. The mirror does not hold as specified (20, 228, 238, 104, 140, 356)

1. Stale in a covered tab: Replayer applies events through `Timer.rafCheck` on `requestAnimationFrame` (`rrweb.js:15286-15313`). Line 238 is false.
2. No flush before measuring: `addEvent` queues through a microtask then the rAF timer (`rrweb.js:16695-16703`); a run can measure one edit behind. `play`/`pause(offset)` cast synchronously but replay from the last full snapshot, cost grows with history.
3. Replayer overrides the iframe width from `Meta` and `ViewportResize` events (`rrweb.js:16221-16230`); design-width sizing needs an explicit override.
4. Sizing to document height breaks `vh`; use live `innerHeight` and rasterize the full document.
5. `neutralizeSubtree` is in `packages/protocol/src/element-capture-sanitize.ts`, deletes `link`, `style`, `meta` and non-local `src`/`href` (`:9-22, 84-105`), runs on a serialized tree with no live-mode hook. Use `record({blockSelector: 'iframe,video,audio,object,embed'})`.
6. The mirror can record itself unless mounted under the blocked `[data-conciv-root]`.
7. `collectCssText` duplicates or goes stale beside `record`'s stylesheet events.
8. Unstated limits: canvas blank, `FontFace` API fonts missing, lazy images never load off-screen, custom elements undefined, "hidden" must not be `display: none` (Replayer sets it until the first resize, `rrweb.js:16743`).

Fix: a sync point before every measurement, a rAF-independent apply path, width override and `innerHeight` height, `blockSelector`, the mount point, the limits list.

### B3. The pairing vote is not implementable from the text (231, 57, 84, 153–167, 145)

No base weights; no scoring functions (geometry distance to score, pixel Hamming to score, structure ancestor test over `within`, kind mapping for design nodes, colour distance); "trusted voter" and "consensus" undefined; floor "median plus 0.1" contradicts ruling 17's "1.3 times the median"; candidate generation and invalidation unstated; `pair-spike`, `pair-design.ts`, `pair-site.ts`, `interp-spike` not in the repository and no record in `docs/designs/spikes/`. Fix: voter table (name, inputs, scoring function, base weight, applicability); define trusted, consensus, margin; fix the floor or record a ruling; commit the spike code and record.

## Majors

- **M1. Stop rules misfire (251, 257–262).** `oscillating` matches any steady item (needs value(r) ≠ value(r−1) and value(r) = value(r−2), with tolerance); pair flips change the item key and read as oscillation (key by node and kind, anchor as a value); `stalled` compares counts and ignores partial progress (include normalized magnitude per stage); precedence, stickiness and `round` reset unspecified.
- **M2. The empty-page switch cuts off building (96, 233, 246, 251).** Once the first component renders, every remaining `unbuilt` node is informational; CUJ 2 fails. The definition at 96 is not computable from one page. Fix: `unbuilt` is a structure item whenever the node's `within` container is paired or the node is top-level, and it is not `image`; define empty by provenance.
- **M3. `sample-data` warnings block `done` and never reach the brief (63, 110, 251).** Put the warning in the brief ("replace the hard-coded sample with the expression") or exclude it from counts and surface separately.
- **M4. Typography mis-sequenced and under-specified (236, 61, 91, 362).** Runs after deltas and scoring; empty-page first run locks in the body font (re-estimate when the paired font stack changes); the spike's range needs two bisections plus a 400 render, about 13 renders not 6; "in the mirror" with no mirror when widths match and probe nodes clash with Replayer's node map (separate scratch iframe); `trimToInk` has no browser implementation (`raster.ts` loads `pngjs`); the 1 px shortcut is circular (render at the live size first); registration missing from the trigger list.
- **M5. Run cost and queueing unbounded (225, 167, 362).** Latest-wins coalescing, cancel superseded runs, per-run ceiling with `partial`, measure the product pairer in the server.
- **M6. Tab cost of continuous rrweb understated (356, 172).** Live-mode Replayer keeps every event; `record` samples mouse, scroll, input by default; memory grows; synchronous flush slows with history; CSSOM and canvas prototypes patched for the client's lifetime, possibly double-patched with the recorder. Fix: record only while a target exists, disable sampling, periodic full snapshot and Replayer rebuild, ceilings in the risk row.
- **M7. Is `done` reachable when widths differ? (55, 230, 251, 257)** snapdom-of-mirror fidelity against a screenshot PNG is unmeasured; canvas is blank. Measure on `u1-1280` from a 1392 tab before step 2 relies on it; mask canvas boxes automatically.
- **M8. Region Capture is viewport-only and the overlay is inside the crop (230, 280).** Use it only when the design height fits the viewport; say whether the overlay is hidden per frame or the path skipped while the pane is open.
- **M9. Carry needs the mirror at two widths (104, 228, 280).** Two layouts, two mirrors, or live rects at W; say why the mirror at W beats live rects.
- **M10. Slice twins conflict with "pairs do not persist"; heat map between widths undefined (196, 231, 272, 77).** The twin voter needs the other target's node-to-component pairs; persist the last run's pairs per target as voter input or pair at the other width in the same run; `Pairer` contract cannot pair node to node; between-width cells carry two possibly disagreeing carries; staleness and ruling 19's twin-vs-direct disagreement display missing.
- **M11. Slices grouped by optional `route` (210, 272, 120–122).** Default route to the tab's route at registration and make grouping its only use, or group by session; state which slice CUJ 6 reports.

## Nits

- N1 (140): `neutralizeSubtree`, `isDangerousTag` live in `packages/protocol`; `element-capture.ts` uses `serializeNodeWithId` options, not `record` options; `scrubSensitiveValues` has no `record` hook, so sensitive fields reach the mirror's snapdom PNG.
- N2 (131, 210): `RecordSchema.route` is `z.string()` (`store.ts:19`); optional route changes `record.json` beyond the two fields.
- N3 (236): size search at 400 before weight is known; spike only tested size at 400 (`typography.md:136`).
- N4 (260): `stalled` never fires while the capture path changes each round.
- N5 (116): name the acceptance comparison (lexicographic) and the capture path.
- N6 (167, 362): pairing timings from a Node and CDP spike; label product cost unmeasured.
- N7 (231): "calibrated scale" clashes with the image scale of item 6.
- N8 (225): a pin, mark or acceptance triggers a run but not a round; say so in section 4.
