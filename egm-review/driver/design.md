# Design lens (BRAINSTORM)

Read: hypothesis, README, text-layer spec, defs.ts, diff.ts, store.ts, status.ts, target.ts, above.ts, tolerances.ts, client/frame.ts.

## Blocker 1: the text stage makes the agent hard-code the design's sample data

Designs carry sample data ("Acme Corp", "$1,200"). Every data cell becomes a `text` delta with `via: 'source'` provenance pointing at the JSX; the fix prompt says change the text. An agent told to clear the text stage replaces `{invoice.total}` with `"$1,200"`, and `done` rewards it. Split `text` deltas into literal (live string appears as a literal in the source file the provenance points at; one file read server side) and data (not in source). Only literal deltas enter the brief and count against `done`. Data deltas are information only and their text is masked like agreeing text. Skill rule: never replace an expression with design text.

## Blocker 2: the loop cannot reach `done` on real designs; only the budget stops it

`componentAboveTolerance` counts any component with `mismatch >= tileGate` (0.005) even without deltas. Photos, avatars, illustrations, charts, icons the app lacks, sample data leave tiles above the gate with nothing actionable; unmatched regions at or above `unmatchedMinimum` (24px) for images the app cannot produce likewise. The residual stage hands the agent a diff image with nothing to fix and it makes random edits. Fixes oscillate (gap fix moves siblings; parent fix lets the matcher descend). No stall or oscillation detection.

- Server owns termination. `design_diff` returns `round`, `budgetLeft`, `stop: null | 'done' | 'budget' | 'stalled' | 'oscillating' | 'residual-only'`. Skill obeys `stop`. An LLM does not count rounds reliably.
- Stalled: score did not improve for 2 rounds. Oscillating: same component and kind came back with a value from two rounds earlier.
- Residual is not an agent stage. When only residual tiles and unmatched regions remain, stop with `residual-only`; the x-ray asks the user to accept them.
- Acceptance is user-only. An approved run becomes a baseline; `done` means nothing worse than the approved residual. Never an MCP tool.
- Defaults: budget 8; stop after 2 rounds without improvement.

## Major 1: stage order puts geometry before typography, causing churn

Font size, line height, weight and content set intrinsic box size. Fixing inset/gap first tunes padding around wrong type; the text stage then moves everything and geometry deltas return. Text groups only form when boxes overlap by more than half, so a row far off produces no `text` delta until geometry is close. Order: (1) structure: missing and extra components, plus target text with no counterpart anywhere on the page; (2) content and type: literal text, font size, line height, weight; (3) box geometry; (4) paint; then stop and hand residual to the user. Parent before child inside a stage. Missing-text check in stage 1 matches strings without positions (target OCR runs against all DOM glyph strings), useful for from-scratch builds. Current stage recomputed each round as the lowest stage with actionable items; items that do not move for 2 rounds are demoted.

## Major 2: `design_diff` is tied to the user's browser tab

`findTarget` without id resolves from the tab's live route; with id, `assertLiveRoute` throws `route-mismatch` when the tab is elsewhere. User browsing breaks every diff; a newly created page needs someone to move the tab. Stale capture: the frame is reused when src and size match; `settle` waits only for fonts and two quiet frames, so a diff right after an edit, before Vite's watcher sent the update, captures the old page and the agent churns. Fix: `design_start` returns a target id; a diff by id loads the target's route in the hidden frame and does not check the tab. A diff waits for the plugin's HMR update for files changed since the last capture, or reloads the frame; the report carries a capture generation.

## Major 3: the score is truncated and not monotonic; make it an ordered tuple

`diffStep` filters then `slice(0, limit)` (12) before writing; `aboveTolerance` counts from the truncated list, so "deltas left" never exceeds 12 plus unmatched. Counts rise after good fixes because the matcher descends into gated parents to depth 3. Page `mismatch` is dominated by large areas and not comparable across pages. Score computed before the slice over all gated pairs; ordered tuple in stage order (unmatched area share, structure items, content and type items, geometry items, paint items, residual area share); progress = tuple went down stage by stage; no weights. Record per run: tuple, round, stop reason, accepted run id. "Who approved" means nothing on a local dev server with no auth; record `acceptedAt` and the run id.

## Major 4: route finding has no data source; crawling is unsafe and picks wrong

Captured route text does not exist (`writeCapture` stores PNGs). Crawling in a frame follows links that fire GET side effects, hits auth walls, cannot fill dynamic segments. Shared chrome dominates text overlap so every route scores alike. A design for a new page resembling an existing one gets a confident wrong match and the agent rewrites a working page. Fix: routes from the framework plugins' route manifest; matching is static: grep source roots for the OCR strings and map hit files to routes through the manifest. Drop strings hitting two or more routes. Confident = top route holds most distinctive hits and at least twice the second. Dynamic route always asks for a concrete URL. When the user said "build", a match is never applied without asking "edit /x or create new?".

## Major 5: `design_start` mixes a write with an open question

Targets keyed by route and width (`store.replace` deletes earlier). Two-phase and idempotent: `{status: 'needs-route', candidates}` writes nothing; `{status: 'ready', target, width, appFacts, stage brief}` once resolved; agent asks and calls again with `route`. Width inferred from image width / scale; ask when it matches no known breakpoint. App facts are not design-specific; reuse an existing app/page tool if one exists. Approval never on MCP. Smaller alternative: add route inference and `candidates` to `design_target` and let the skill orchestrate; justify the new tool against this.

## Major 6: the adapter contract does not hold today; Figma breaks "no network"

`targetStep` runs OCR on every target. `targetRuns` reads only `root.children` with `kind === 'text'`; a Figma tree nests text so it would be ignored and OCR run anyway. Figma URL as `ref` needs network and auth. Fix: OCR only when the adapter produced no text nodes; downstream walks the whole tree; the agent fetches the Figma reference (Figma MCP) and hands `design_start` local files (render PNG plus node JSON).

## Major 7: SQLite not justified; images in it harmful

No query named that files cannot answer. Migration plus second source of truth; PNG blobs bloat. Separately, `prune` keeps 20 results per target, so a long loop's round-1 baseline is deleted mid-loop. Fix: add score tuple, round, stop reason, accepted-run fields to the run JSON. Never prune the first or the accepted run. Images stay files. SQLite as an index of rows pointing at files only when a cross-target query has a consumer.

## Major 8: token economics unstated

Per round: diff report 3k–5k, source reads and edits 5k–15k, image look 1.5k; 10k–20k per round, 8 rounds 100k–200k, before wasted rounds. Brief carries only the current stage's top 3–5 items; default `limit` from the driver is that small; diff images never pushed into context.

## Nits

1. From-scratch build should not start with the diff loop: no `data-conciv-source` components, everything unmatched, round 1 wasted. Skill: build a first pass from the image using components named in app facts, then loop. `design_start` returns the image path for the first pass.
2. Multiple widths: one width per loop; status reports the others as not yet compared.
3. Concurrent loops on the same route: re-registering deletes the directory mid-diff (`no-target`). Document, no locking.

## Summary

Termination and scoring on the server (ordered tuple before truncation, stall and oscillation stops). Residual accepted by the user, never the agent. Text deltas split literal/data; data never "fixed". Order: structure, content and type, geometry, paint. Diff by id in the frame, synced with HMR. Routes from the manifest plus static grep, no crawl. `design_start` two-phase, writes nothing until resolved. Adapter contract fixed in code before claimed; Figma fetched by the agent. No SQLite until a query needs it.
