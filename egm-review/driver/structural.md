# Structural lens (BRAINSTORM)

Checked against code: `TargetModel` and `TargetAdapter` exist; a store interface sits behind targets and runs (`put`, `find`, `list`, `writeRun`, `lastResult`); targets stored per route and width.

## Journeys the brief must cover (same subsections each: trigger, `design_start` result, agent next step, what the user sees, how it ends)

- J1 user names an existing page. Unresolved route (typo, dynamic segment, login). Width source.
- J2 no page named, one route matches by text. Where route text comes from; crawling is a new capability (page budget, login, staleness). Define confidence.
- J3 several or weak matches. Tool cannot ask; `design_start` returns a "needs a choice" result with candidates and scores; agent asks. Result shape is contract.
- J4 no page exists, agent creates it. How the server learns the new route. Registering before route known does not fit the keyed store: find route first, or a pending target state, named.
- J5 approval. Who, which control, what it changes (stop loop, freeze target, record only). What happens when target replaced or page changes after approval. Approval before `done`?
- J6 Figma later. Identical from `design_start` onward; only `accepts` changes. Frame width vs passed width. Image-only steps (OCR, color sampling) skipped by adapter or by enrichers?
- J7 resume/re-run on an existing target.
- J8 several widths per route vs non-goal "multiple references per route".
- J9 loop stalls: no score improvement, or a fix breaks an earlier stage.

## Goals and non-goals

- G1 Major: contradiction between "multiple references per route" non-goal and per-width store. Say "one per route and width".
- G2 Major: "no setup" conflicts with "or crawled". Make crawling a goal with limits or a v1 non-goal.
- G3 Major: "quickly" has no number.
- G4 Major: loop owner unstated (agent runs it, stop rule reads as server policy).
- G5 Major: SQLite serves no journey; state the goal or move to non-goals.
- G6 Nit: "x-ray additions named above" never listed (approve control, score, stage).
- G7 Major: missing non-goal: server never changes user source.
- G8 Nit: harnesses without skills: goal or non-goal.
- G9 Major: app facts need a scope limit or they become a second discovery API.

## Alternatives

- A1 skill only: cheapest, no route matching, no app facts, prose drifts per harness.
- A2 tool only: works everywhere, nothing triggers it, ordering in tool descriptions.
- A3 server-driven loop: one testable policy; brittle per-session state.
- A4 agent-driven loop: diff stays pure; policy copied into skill. Recommended split: server derives stage from the report (never stored), agent owns round count, budget is a skill setting.
- A5 stages vs single weighted ranking: stages are a public contract every comparator maps onto; default stage "residual"; defend geometry under structure.
- A6 SQLite now vs later: store interface already hides storage; keep files for v1, add score/approval/round fields behind the interface; move when a query `list`/`lastResult` cannot serve. PNGs stay on disk either way.

## Success criteria

- S1 time to first diff; median rounds to `done` on a fixed reference set.
- S2 `done` or residual threshold, on which pages.
- S3 route ranked first in N% of a labelled set; ask when top two within a margin.
- S4 zero config, zero extra commands, clean-install test.
- S5 what a good score is, or "display only".
- S6 second fake adapter passes start-diff-done with no downstream change.
- S7 approval recorded with user and time, shown in status, cleared or flagged when target replaced.

## Upkeep risks

- R1 Blocker: `design_start` as one tool with many results becomes the brittle state machine. Thin layer over register, match route, app facts; closed discriminated result set.
- R2 Major: loop state on server. Stage derived per report; budget on agent.
- R3 Major: stage assignment spread across comparators. One category-to-stage map, default residual, one check.
- R4 Major: SQLite migration doubles the change. Defer; nothing outside the store imports SQLite.
- R5 Major: OCR and color sampling hard-wired into target path. Run as enrichers that apply only to missing fields.
- R6 Major: crawling makes the server an HTTP client of the app. Non-goal v1; route text from captures with capture time.
- R7 Nit: app facts grow. Fixed field list.
- R8 Nit: skill text and stage names drift. Skill refers to names the server returns.

## Suggested outline

Problem; Goals; Non-goals; Journeys J1–J9; Alternatives A1–A6 with verdicts; Contract (`design_start` outcomes, stage map, score fields, approval record); Success criteria S1–S7; Open questions.
