# Implementation readiness lens (BRAINSTORM)

Read: hypothesis, README, src/shared/defs.ts, src/tool/steps/diff.ts, src/tool/steps/target.ts, src/server/store.ts. ARCH = answer changes the architecture.

## Blockers

1. ARCH, parts 2–3: a target cannot exist before its route is known. `TargetRecord.route` required; `store.put` replaces by (route, width); `targetStep` falls back to the live route. Options: (a) load model and OCR in memory, match, `put` only once a route is chosen (ambiguous answer re-runs OCR unless cached under a pending id); (b) unbound target state plus a bind call; (c) two calls, `match` then `register`. Decides `targets.route` nullability, find/replace semantics, whether `design_diff` rejects unbound targets.
2. ARCH, part 3: "ask the user" has no mechanism. (a) discriminated result `{status:'matched', route, confidence} | {status:'ambiguous', candidates:[{route, score}]} | {status:'none'}`, skill tells the agent to ask and call again with `route`; (b) MCP elicitation, not universal. Also: how the agent says "create at /x"; `design_diff` before the page exists hits `assertLiveRoute` `route-mismatch`, error text must make sense.
3. ARCH, part 3: where route text comes from. Nothing persists it: `writeCapture` keeps PNGs pruned to `runsKept`; `LiveComponent.text`/`glyphs` never persisted. Options: (a) passive `route_text(route, captured_at, text)` on every capture or visit; (b) crawl via the hidden capture frame, no params, no auth, fails on `frame-blocked`; (c) enumerate from framework plugins or filesystem then crawl. Parameterized routes; staleness. Crawling adds a server-driven navigation loop.
4. ARCH, part 6: how approval reaches the server, who "who" is. An MCP approval tool lets the agent approve its own work. Non-MCP HTTP endpoint posted from the x-ray; x-ray is read-only today (verify). Identity: git `user.email`, OS user, or free text. What voids approval: new run, re-registration (today deletes the directory and mints a new id, approval silently disappears), source change.

## Major

5. Part 6: SQLite migration and rollback. Import or drop `.conciv/design/<id>/{record.json, model.json, target.png, result-*.json}`; old build cannot read DB-only targets; `runsKept` prunes PNGs while rows persist. Decide DB file and driver (reuse the server's), PNGs on disk with paths (recommended), `model.json` column or file, files-as-truth transition with DB indexing runs and scores, idempotent import at boot, hard delete vs `superseded_at`. Minimum tables: `targets(id, route, width, height, scale, name, source_kind, source_ref, created_at, superseded_at, approved_by, approved_at)`; `sessions(id, target_id, prompt, started_at, budget, ended_at, end_reason)`; `runs(id, target_id, session_id, round, at, mismatch, residual, stage, deltas_structure, deltas_text, deltas_paint, deltas_residual, unmatched, live_path, diff_path, report_json)`; optional `route_text`.
6. ARCH, parts 5–6: "rounds taken" needs a session entity. Server-owned session id passed to `design_diff` (stateful) or skill counts and server infers runs since registration (stateless, weaker). Budget owner and default. `design_status` when budget exhausted before `done`: new `exhausted` state?
7. Part 3: confidence computation. Normalization (group rule vs tokens); containment over Jaccard; IDF down-weight of chrome tokens; tolerate OCR misreads; absolute minimum plus margin over second best; drop numbers and dates (mock "Invoice #1042"); OCR `runs: 0` or error goes straight to ask. `TargetNode.confidence` hard-coded 1 today.
8. Part 5: stage assignment and delivery. `padding` missing from the stage list (structure); `unmatched` missing/extra to structure; residual = above `tileGate` with no deltas (diff.ts keeps those when `children === 0`). Global vs per component; advisory vs filtering (filter before `.slice(0, limit)`); recompute every run; fixed brief string; `stage` and `brief` in `DiffReportSchema`, repeated in `hint`.
9. Parts 5–6: stored report compatibility. `lastResult` parses with `DiffReportSchema`, returns null on failure; new fields must be optional or defaulted or every old result reads null.
10. ARCH, part 1: skill delivery. MCP server cannot install a skill. MCP prompt/resource, server instructions, `conciv init`, or Claude Code only. If others lack it, order and stop rule live in tool outputs (`stage`, `brief`, `next`); skill is a thin trigger. Safer default.
11. Part 2: adapter contract and OCR skip. `targetStep` always runs `readText` and appends text nodes; Figma needs a skip rule (model already has text, or capability flag). `image` vs `ref` naming; keep `image` on `design_target`. Figma needs network, forbidden by the constraint: pre-export step, known limit. Default width for a PNG should be image width / scale, not the live tab width.
12. Part 4: app facts schema `{plugins, routes, sourceRoots}`; sources; size cap; every call or first only.

## Nits

13. Route normalization follows diff.ts: exact route, then pathname without query.
14. `design_start` on an existing (route, width) replaces and deletes history: warn, resume, or replace.
15. `prompt` has no stated use.

Settle 1–4 and 6 before any plan.
