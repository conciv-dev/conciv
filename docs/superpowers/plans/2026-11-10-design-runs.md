# Design Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every trial run lands in one store by itself, with its provenance, and every wave number, judgement and report is a product of that store through the house query.

**Architecture:** The live tables stay. The runs code is deleted and rebuilt: the host gains options and a home scope for extension commands plus a home catalog; the design extension gains provenance at `run start`, a strict import with artifacts, gc, report and views as sources. Rewrite, not patch: each task deletes what it replaces.

**Tech Stack:** TypeScript, drizzle-orm (sqlite, `sqliteView`, RQB v2), node:sqlite, `@bomb.sh/router` (CLI), zod, execa, Playwright, es-toolkit.

**Spec:** `docs/superpowers/specs/2026-11-10-design-runs-design.md` (read it whole, including "Rulings from the builder check").

## Global Constraints

- One export per file, functions only, no comments, no casts, no `any`, no `else`, no `let`, files under 600 lines, no regex, library first, no new numeric constants (durations and defaults live in `designConfig.runs`).
- Commit locally only; never push; never open a PR; no AI attribution lines; never amend, rebase or stash.
- Gates per task: `pnpm typecheck`, `pnpm lint`, `pnpm build` in each touched package, the named tests, `fallow` on the changed range. Build `@conciv/db` and `@conciv/extension` before the packages that depend on them.
- Store home is the conciv home from `concivHome` / `extensionDb`'s `home`. No path from the session scratch folder appears in code or tests.
- Every number in a report or a test assertion about the store comes through a source read (`catalogSources`, rpc `db.read`, or `conciv db query`).
- Never kill a process you did not start; never print, log or write `TYPESAFE_API_KEY` or `FIGMA_API_KEY`.

## Review Focus

1. `conciv db query --from design_run_summary` from a directory with no project reads the home catalog and works.
2. A `design_check` after the engine restarted mid-run (the chat run swept to `aborted`) opens a new design run; the old row says `aborted` and keeps its rounds.
3. Two engines on two projects writing the store at once leave both runs intact (WAL; one writer per run).
4. `design:judge` on a run whose `design` or `screenshot` artifact is missing names the run and width and writes no judgement.
5. A page whose rendered height is far beyond the design frame gets a row and cannot be `done`.

---

Tasks 1 to 5 of the first build are done (home scope, store schema, views, gc, report). What follows replaces the per-project live
database, `run start/end` and `run-import` with the extension writing the store itself, per the spec's "The data model", "A run
rides the house run lifecycle" and "The commands".

### Task 8: the extension writes the store, keyed by session

**Files:**

- Modify: `packages/extensions/design/src/server.ts` (open `openStore(server.home)` as the one db; `createStore({db: store, …})`; `openHomeDb` stays)
- Modify: `packages/extensions/design/src/server/tables.ts` (`designTables(table)` store shape only; `runs` gains `session_id: text()`, `status: text({enum: RUN_STATUSES})` where the enum is TanStack's `RunStatus` values re-exported by `@conciv/protocol/chat-event-types`; `prompt_head` nullable)
- Modify: `packages/extensions/design/src/server/store.ts`, `write-fom.ts`, `runner.ts`, `differ.ts`, `xray-routes.ts` and every reader of `openRun(db)`: the run id comes from a `runs` map in the design runtime keyed by `sessionId` (`ToolRequest.sessionId` is on every tool call); `design_get` with no entry inserts the run row with provenance (`provenanceOf`, `projectKey(server.cwd)`), `status: 'running'`, `model` from the request, and stores the id
- Delete: `packages/extensions/design/src/server/runs/open-run.ts`, `runs/commands/run-start.ts`, `run-end.ts`, `run-import.ts`, `runs/import/*`, `store-tables.ts` `lanes`, the `'run'` branch of `designTables`, `packages/extensions/design/drizzle/*` (the per-project design migrations; the store migrations under `drizzle-runs/` stay and gain one)
- Test: `packages/it/test/design.it.test.ts`, describe "the store is written at the source"

**Interfaces:**

- Produces: `runtime.runs: {of(sessionId): Promise<number>, close(sessionId, state: {status, ended, cost}): Promise<void>}` (one file `runs/session-runs.ts`)

- [ ] Step 1: failing IT: with a temp `CONCIV_HOME`, drive `design_get` then one `design_check` through the IT host as the existing describes do; assert through the home catalog (`conciv db query --from design_stored_runs`) one run with `status == 'running'`, `session_id` set, `project_key` the fixture's package name, and a `design_stored_rounds` row for it. Assert the project's `.conciv/conciv.db` has no `design_runs` table.
- [ ] Step 2: run it, keep the failing line.
- [ ] Step 3: implement as listed. Migration `drizzle-runs/<ts>_runs_session_status`: add `session_id`, `status` with backfill `completed` where `ended` is not null, `aborted` otherwise.
- [ ] Step 4: gates; `design.it.test.ts` whole (the old "run start and run end", "run import", "runs gc --state" describes are deleted with the commands; "report" and "runs gc" artifact describes stay and must pass).
- [ ] Step 5: commit `design: the extension writes its runs to the store as they happen`.

### Task 9: the design run closes with the chat run

**Files:**

- Modify: `packages/extension/src/types.ts` (server member `turns: {onEnd(listener: (turn: {sessionId: string; runId: string}, run: RunLifecycle) => Promise<void>): () => void}`), `packages/it` host wiring where `TurnHooks` is built (`packages/chat/src/turn.ts` builds them: fan `end` out to extension listeners)
- Modify: `packages/extensions/design/src/server.ts` subscribes; `runs/session-runs.ts` `close` writes `status`, `ended`, `cost` (from `usage`, the same cost field the session's usage snapshot carries), `verdict` from the last round, guarded `where status = 'running'`
- Test: `design.it.test.ts`, describe "a run closes with its turn"

- [ ] Step 1: failing IT: after `design_get` + `design_check`, end the turn through the host the way the chat ITs do (the IT kit's fake harness ends a turn; if none exists, call the host's `TurnHooks.end` through the IT host fixture's server handle), then assert `status == 'completed'`, `ended` set; call the close a second time with a different status and assert the row is unchanged.
- [ ] Step 2: run, keep the failing line.
- [ ] Step 3: implement.
- [ ] Step 4: gates (`@conciv/extension`, `@conciv/chat`, `@conciv/it`, `extensions/design`), design IT whole.
- [ ] Step 5: commit `design: a run closes with its chat run`.

### Task 10: artifacts at the source, and `design:judge`

**Files:**

- Modify: `packages/extensions/design/src/server/runner.ts` (each check writes its screenshot per width and the design render it measured against as `artifacts` rows with files under `<home>/artifacts/<run>/`, lifetimes from `designConfig.runs`; reuse `runs/import/store-artifacts.ts`'s file writing by moving it to `runs/artifacts.ts` before Task 8 deletes the import folder)
- Create: `packages/extensions/design/src/server/runs/commands/judge.ts` (`design:judge <wave> [--judge-model]`, home scope: for each run and width of the wave without a judgement by that model, copy the design and screenshot artifacts to two neutral names in a temp dir, run `claude -p` with the Read tool and a fixed prompt asking for a 1 to 5 score and a one-line reason judging only what is visible, write `judgements` through the catalog's writable source; a missing artifact is named in the output and nothing is written for it)
- Modify: `design-commands.ts`, `runs-gc.ts` (drop `--state` and `lanes`)
- Test: `design.it.test.ts`, describes "artifacts at the source" and "design:judge"

- [ ] Step 1: failing ITs: (a) after one check, `design_stored_artifacts` has one `screenshot` and one `design` row per measured width with existing files; (b) `conciv design:judge <wave>` on a run whose screenshot file was removed prints the run and width and `design_stored_judgements` stays empty.
- [ ] Step 2: run, keep failing lines.
- [ ] Step 3: implement.
- [ ] Step 4: gates, design IT whole.
- [ ] Step 5: commit `design: artifacts are written by the check, and design:judge scores them`.

### Task 11: a collapsed render is a row

**Files:**

- Modify: `packages/extensions/design/src/server/gate.ts` or `reflow.ts` (where width rows are made): a row when the measured page height exceeds the design frame height by more than the tolerance `page-height.ts` already uses; wording like the other rows; verdict not `done` while it stands
- Test: `design.it.test.ts`, existing `design_check` describe

- [ ] Step 1: failing IT with a fixture page whose body has a very large `min-height`: the check returns a row naming the page height and the verdict is not `done`.
- [ ] Step 2: run, keep the failing line. Step 3: implement. Step 4: gates, design IT whole.
- [ ] Step 5: commit `design: a page far taller than its design is a row`.

### Task 12: docs and migration of the real store

- [ ] Update the spec's "Left to the builder" and the README of `extensions/design` (runs section: how a run is recorded, the three commands, the queries). Delete `docs/superpowers/specs/2026-11-10-design-runs-store-design.md` (superseded, its content is in git).
- [ ] With the real conciv home, start the IT host fixture once (the store migrates on open), then `conciv db query --from design_stored_runs --select status --limit 3` to show the backfilled statuses; stop what you started; remove the fixture's `.conciv`.
- [ ] commit `docs: runs written at the source`.
