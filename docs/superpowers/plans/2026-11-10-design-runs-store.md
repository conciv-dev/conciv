# The runs store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every run's rounds, rows, votes, pairings, relation and full tool replies in one SQLite store with keys, indexes, constraints and named views, queried through one function behind a CLI and an MCP tool.

**Architecture:** The design tables gain foreign keys, indexes, checks, relations and a `reply` column; a `runs.db` beside `home.db` holds them with `run_id` as parent; the trial harness and a CLI import a finished run's `conciv.db` by `ATTACH` + `INSERT … SELECT`; drizzle views encode the wave questions; `queryRuns` runs read-only SQL for the CLI and `design_query`.

**Tech Stack:** drizzle-orm (sqliteTable, sqliteView, relations, index, foreignKey, check), drizzle-kit migrations through `gen-migrations`, better-sqlite3 / node sqlite as the package uses, `openMigratedDb`.

**Spec:** `docs/superpowers/specs/2026-11-10-design-runs-store-design.md`

## Global Constraints

- Design package code rules: one export per file, functions only, no comments, no casts, no `any`, no `else`, no `let`, files under 600 lines, no regex, library first, no new numeric constants.
- Migrations are generated (`pnpm gen-migrations`), never hand-edited; existing per-run dbs must migrate forward.
- `PRAGMA foreign_keys = ON`, `query_only` on read connections.

## Review Focus

- A per-run db written before this change (no `reply` column, nullable `run_id`) imports without error: the copy fills `run_id` and leaves `reply` null.
- A `design_get` reply over the MCP size budget is stored whole and the tool's own reply is unaffected.
- Importing the same state dir twice adds nothing (unique on source).
- `design_query` refuses a write (`INSERT`, `PRAGMA`, `ATTACH`): `query_only` raises, the tool returns the error text.
- A view over an empty store returns zero rows, not an error.

---

### Task 1: Keys, indexes, constraints, relations, and the stored reply

**Files:**

- Modify: `packages/extensions/design/src/server/tables.ts`, `store.ts` (`writeToolCall` takes `reply`), the tool wrapper that calls `writeToolCall`
- Create: `packages/extensions/design/src/server/relations.ts` (drizzle `relations()` for every FK), `src/shared/tool-reply.ts` (the reply union)
- Test: `packages/it/test/design.it.test.ts` (new describe), a unit test on the schema (`sqlite_master` lists the indexes and FKs)

- [ ] **Step 1:** Failing unit test: open a fresh db, assert `PRAGMA index_list` on `design_rows` includes the `(run_id, target_id, round)` index, `PRAGMA foreign_key_list` on `design_rounds` names `design_runs`, and `design_tool_calls` has a `reply` column.
- [ ] **Step 2:** Add to `tables.ts`: indexes and FKs per the spec, checks for `tool`, `kind`, `magnitude`; `reply` json column `$type<ToolReply | null>`; `relations.ts`. Run `pnpm gen-migrations`; a migration appears. Commit `design: the tables carry their keys, indexes and constraints`.
- [ ] **Step 3:** Failing IT: a `design_get` call on the fixture host, then `SELECT reply FROM design_tool_calls` returns the same json the tool returned (deep equal on `components` and the first node's `hint`).
- [ ] **Step 4:** `writeToolCall` stores the reply; every tool passes it. Gates (typecheck, lint, build, design ITs). Commit `design: a tool call stores the reply the agent read`.

### Task 2: `runs.db` and the import

**Files:**

- Create: `packages/extensions/design/src/server/runs-store.ts` (`openRunsStore(home)`), `import-run.ts` (`importRun({runsStore, stateDir})`), CLI command `conciv tools design runs import <state dir>`
- Modify: `packages/it/scripts/design-trial.ts` (import at run end, print the new `run_id`)
- Test: `packages/it/test/design-runs.it.test.ts`

- [ ] **Step 1:** Failing IT: import a fixture state dir (copy one from `$S/figma-loop/runs/twentysix-figma7-1/state` into `packages/it/fixtures/runs/`, trimmed to its db) into a temp `runs.db`; `design_runs` has one row with `source_path`, counts of rounds and rows equal the source's; importing again changes nothing.
- [ ] **Step 2:** Implement with `ATTACH` + `INSERT … SELECT` over column lists derived from the drizzle table objects; one transaction; `foreign_keys = ON`. Commit `design: a finished run is imported into the runs store`.
- [ ] **Step 3:** Harness imports at run end; CLI command. Commit `design: the trial and the CLI import a run`.

### Task 3: Views and `queryRuns` behind the CLI and `design_query`

**Files:**

- Create: `packages/extensions/design/src/server/views.ts` (the six `sqliteView`s), `query-runs.ts` (`queryRuns({runsStore, sql, params})`), CLI `conciv tools design query <sql> [--json]`, tool `design_query` in the tool defs
- Test: `design-runs.it.test.ts` (extend)

- [ ] **Step 1:** Failing IT: after importing the fixture run, `SELECT * FROM run_summary` returns one row per width whose `rows` and `verdict` match the fixture's `gate-final.json`; `SELECT * FROM hint_vs_drawn` returns rows for nodes with a stored hint.
- [ ] **Step 2:** Views in drizzle, migration generated. Commit `design: the wave questions are views`.
- [ ] **Step 3:** Failing IT: `queryRuns` with `INSERT …` throws with SQLite's `query_only` message; `design_query` returns that text as its error.
- [ ] **Step 4:** `queryRuns`, CLI, tool (description lists the views). Commit `design: one query function behind the CLI and design_query`.

### Task 4: Measure

- [ ] **Step 1:** Import the state dirs of waves 24, 25, 26 and the xray6/9/10/11 runs from `$S/figma-loop/runs*` with the CLI.
- [ ] **Step 2:** `run_summary` against `twentyfive.md`, `twentysix.md`, `twentyseven.md`: a table of differences, each explained (view bug fixed, or hand table wrong). `hint_vs_drawn` and `kit_per_round` against `xray-build.md` kit-kept counts.
- [ ] **Step 3:** Report with the queries used verbatim.

### Task 5: The query is the house query

**Files:**

- Modify: `packages/db/src/source-types.ts` (`Source.table: AnySQLiteTable | SQLiteView`, `Source.database?: string`), `source-catalog.ts` (view name via `getViewName`, database carried), `catalog-sources.ts` (qualified table name when a database is set), `packages/extension/src/extension-db.ts` or the engine's db open (attach `runs.db` as `runs`), `packages/extensions/design/src/server/sources.ts` (runs tables and six views as sources), `tools.ts` (remove `design_runs`), `commands.ts` (remove the query action), `packages/it/scripts/design-trial.ts` if it called the removed CLI
- Delete: `query-runs.ts`, `shared/runs-def.ts`
- Test: `packages/db` unit tests for the two new members; `packages/it/test/design.it.test.ts` (replace the queryRuns ITs)

- [ ] **Step 1:** Failing unit tests in `packages/db`: a source over a `sqliteView` lists its declared fields; a source with `database: 'runs'` reads `select … from "runs"."design_rows"`.
- [ ] **Step 2:** Implement both host members. Commit `db: a source can be a view in an attached database`.
- [ ] **Step 3:** Failing IT: after `runs import`, `conciv db read --from design_run_summary --where 'cost > 2' --select run,width,verdict` returns the fixture run's widths; `--from design_lost_components --where 'component == "Chip"'` returns the Task 7g rows on the xray11 fixture if present, else the Pill fixture.
- [ ] **Step 4:** Declare the sources; attach `runs.db`; remove the raw SQL door. Gates. Commit `design: the runs store is read through the house sources`.
- [ ] **Step 5:** Re-run the Task 4 comparison through `conciv db read`; the same difference table. Report.
