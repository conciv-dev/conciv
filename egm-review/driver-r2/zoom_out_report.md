# Zoom-out report (Stage 5) — design-driver.md, revision 2

Reviewer: egm-zoom-out (opus), zoom-out standard, full file. Spike records and code checked (`server.ts`, `types.ts`, store, `diff.ts`, `capture.ts`, `protocol/src/bundler-types.ts`, whiteboard store, package manifests).

## Verdict: changes required (1 Blocker, 9 Major, 5 Nit)

The core is sound and simplifying: flat target list, live DOM as the only tree, deltas through pairs, server-owned stage and stop, score before truncation (Alternative J is the best decision in the document). The trouble is everything around it: 73 files, 5 new dependencies, 8 tables, undo/redo/replay, a paid remote engine, node carry, cross-width grouping, a second renderer, a worker pool, 5 registry slots.

### B1. Blocker: rounds fired by HMR break the stop rule (36, 217–221, 225, 240, 634, 680)

`round` counts runs; runs come from every debounced `hmr-update`, every `design_diff`, every mark. One agent fix spans several files saved seconds apart, far over the 150ms debounce, so one iteration is several runs: the budget of 8 is spent on partial edits, and `stalled`/`oscillating` fire on half-applied fixes. User marks burn the agent's budget. **Fix:** a round and its budget happen only on `design_diff`; HMR invalidates the cached capture and pushes a lightweight x-ray refresh that is not a run; marks re-evaluate without incrementing `round`. Removes the debounce, the settle wait, the module-graph lookup and most of `p-queue`.

### M1. Split into a shippable core and follow-ups (27–46, 428–735)

Needed for the three problems: skill triggers; stage, brief, score, stop; flat list with segmentation, estimates, rule roles; pairs; a store for pairs, decisions, runs; x-ray marks and acceptance. Not needed: event timeline with undo/redo/replay, Jev, node carry (CUJ 6), `target_elements` (CUJ 7), Chromium clips, `tinypool`, `match` template verification. Recommend Steps 1–5 trimmed, Step 7, Step 6 limited to marks and acceptance; rest under Future Improvements gated on Step 8 trials.

### M2. Undo/redo contradicts Non-Goals and duplicates git (42, 54, 61, 112, 257–260, 270, 400, 640–642, 692)

Server applies patches to source although line 54 rules that out and line 61 names git the safety net. Edit capture has a gap: `hmr-update` fires after the write, so the first change to a file has no pre-image. **Simplest:** drop undo, redo, replay, edit events; `runs` rows with capture and diff paths already give a browsable history; `decisions` and `pairs` carry timestamps.

### M3. Decision engine is one real implementation plus a stub, value rests on a paid API untested in CI (13, 43, 190, 213, 240, 242–244, 644–646, 674)

Rules engine answers "no decision" with confidence 0, so every advertised judgment comes from the enricher rules or Jev, and Jev is manual-trial only. **Simplest:** rules; `unknown` otherwise; x-ray "mark dynamic", `accept-delta`, re-pair and accept settle the rest. Add the engine when trials show hand marking is the bottleneck.

### M4. Registry slots and config enums with one implementation each (44, 276–278, 476, 516–518)

Swapping a function later is a one-file change; the adapter registry is the one seam with a known second consumer. **Simplest:** plain imports; keep adapters only.

### M5. Re-export carry (CUJ 6) and `target_elements` (CUJ 7) are speculative (39, 120–130, 199, 205, 252–253, 547)

Pairs are keyed by `live_source_id`; re-running the pairer after a re-export returns most pairs. Decisions anchored to live ids survive without carry. Per-width pairs already give per-width `axis`/`columns`/`gap` and the breakpoint tag. **Simplest:** supersede and re-pair; anchor decisions to live ids; defer carry and grouping.

### M6. `match` verification is a second pairing mechanism (33, 201, 549–551, 628)

Needs a whole-page live raster, a worker task and a window; the pairer already pairs by text and overlap, geometry deltas express `moved`, `unbuilt`/`extra` express `missing`. **Simplest:** drop `verify.ts`; widen the pairer with a nearest-box fallback if trials show big displacements.

### M7. Two capture renderers for paint clips (77, 223, 436, 622–624)

Chromium opens a second app page (own auth, state); two renderers mean two anti-aliasing behaviours and the document does not say which wins. **Simplest:** `snapdom` clip only.

### M8. `tinypool` and `p-queue` premature (78, 217, 223, 401, 577–579)

Neither imported anywhere in the repo. Concurrency 1 per target is a stored promise chain; no measured stall motivates a worker, contradicting Alternative S's own reasoning.

### M9. Spike records do not support the segmentation fixes claimed (85, 188, 376)

`threshold-rgb-recurse-images` was measured and "recovered nothing" (`results.md` line 320). Text-as-boxes was the edge variant's failure, not the threshold method's ("Text never became a spurious container", line 324). The spike's estimate caveat for nodes under an image leaf is dropped silently. **Action:** mark recursion unmeasured or a trial item.

### Nits

- N1 (393, 401): segmentation cost misquoted; whole segmentation is 33–76ms on fixtures, 0.36–1.2s on 1280x2400 real pages.
- N2 (79, 380): Jev price not in the spike ("No price list was consulted"); cite or drop.
- N3 (31, 86): typography result is macOS Firefox vs Chromium; Figma and Linux exports unmeasured (`font-spike/results.md` 401–403); add a Figma-export check to Step 8.
- N4 (248, 334, 411): whiteboard uses `drizzle-orm/libsql/migrator` with a folder; the precedent is core's `packages/db`. Cite core only.
- N5 (175, 187–190, 199, 203, 278): constants and per-pixel heuristics in architecture sections; move to the plan or README.

## Reuse confirmed

`sourceChanges` (server.ts 41–50), `BundlerBridge.moduleGraph` with `importers` (bundler-types.ts 14, 34), `frameAtRoute` (capture.ts 40), `assertLiveRoute` (diff.ts 53), `TargetStore` (types.ts 190), `runsKept: 20`, page `client/hmr.ts`, `diff` ^9 in cli, `drizzle-orm` catalog. Not in repo: `p-queue`, `tinypool`, `@typesafe-ai/sdk`.

## Keep as is

Flat list (Alt J); pairs persistent (Alt R); server-owned stage, stop, score before truncation; two-phase `design_target` with closed outcomes and static route cascade; intrinsic-property deltas; literal-versus-expression roles; acceptance outside MCP; SQLite for pairs, decisions, runs.
