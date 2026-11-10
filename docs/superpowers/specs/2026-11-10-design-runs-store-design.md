# The runs store: every run queryable, by us now and by the agent later

Companion to `2026-11-06-design-three-tools.md` and `2026-11-09-design-components-design.md`. Those specs make the tools measure a
page. This one makes what the tools saw and said, over every run, a database we can ask one question of.

## Why

Twenty-five waves of six runs each were analysed by an agent exporting json by hand into a markdown table per wave. Each run leaves
its own `conciv.db` in a throwaway state dir; the replies the agent read (`design_get` hints and catalog section, `design_check` verdict
sentences) are not stored at all, only their byte size. "Did the agent see the hint and draw by hand anyway" took a brief, a run and a
log grep to answer. The schema has no indexes, no foreign keys, no relations and one check constraint; every join is a scan.

## Intent

One store holds every run's rounds, rows, votes, pairings, tool calls with their full replies, and the catalog relation, under
`run_id`, with the keys and indexes the questions need. One query function answers in SQL, through three doors: a CLI for us, a
`design_query` MCP tool for the agent mid-run, an x-ray Runs view later. The wave table becomes one query that yields the same
numbers the hand-built tables did.

## Goals

- Nothing a run showed the agent is lost: every tool reply is stored whole, beside its input.
- One store across runs. A wave is `WHERE run_id IN (…)`; a question over fifty runs is one statement.
- Keys, indexes and constraints that make the questions cheap and the data honest: every child row points at its run and round by
  foreign key, every lookup the views make is indexed, enums are check constraints, json columns are typed.
- Named views for the questions we ask every wave, so nobody writes the join twice.
- One implementation behind the CLI, the MCP tool and the x-ray.

## Non-goals

- A dashboard. The x-ray Runs view is a later ruling; this spec ends at the query function and the CLI.
- Replaying a run. The store answers what happened; the lanes still run the runs.
- Rewriting the per-run `conciv.db`. It stays the hot store the tools write during a run; the runs store is where runs go when they end.

## Anti-goals

- A second schema. The runs store uses the design tables as they are, with the keys added; no "analytics" copy with different names.
- An ORM layer over the questions. Views are SQL; the query function takes SQL. Drizzle types the tables and the views, it does not hide them.
- Storing a reply twice. A `design_get` reply of 226 KB is stored once per call, compressed by SQLite's page store as it is; no
  dedupe table, no blob store, until a measurement says the file is too big.

## Constraints

- The store is a SQLite file in the home folder beside `home.db` (`runs.db`), opened through `openMigratedDb` like `home.db`: WAL,
  `busy_timeout`, migrations serialized by the lock file. `PRAGMA foreign_keys = ON` on every connection; `synchronous = NORMAL` under WAL.
- Schema: the design tables from `tables.ts`, with:
  - `design_runs.run_id` the parent; every other table's `run_id` `NOT NULL REFERENCES design_runs ON DELETE CASCADE` in the runs store
    (the per-run db keeps `run_id` nullable for rounds written before a run starts; the copy fills it).
  - `(run_id, target_id, round)` indexed on rounds, rows, votes, fom, candidates, missing, regions, widths, node_components;
    `(run_id, round)` on tool_calls; `(target_id, node)` on fom and rows; `(component_id)` on node_components.
  - `design_tool_calls.reply` json, typed by tool through a discriminated union of the tool reply types the design package already
    exports; `input` stays. A reply that failed stores `error` and `reply` null.
  - Check constraints: `tool in (…)` over the tool names, `kind` and `magnitude` on rows over their const objects, `verdict` on runs.
  - `relations()` declared for every foreign key so `db.query` with `with:` works; a `$type` on every json column.
  - Drizzle views (`sqliteView`) for the wave questions below, generated into the migration like the tables.
- Writes: at run end the trial harness, and `conciv tools design runs import <state dir>`, copy the run's rows from its `conciv.db`
  into `runs.db` in one transaction, by `ATTACH` and `INSERT … SELECT`, assigning the run a new `run_id` and keeping the old one as
  `design_runs.source_run_id` with the state dir path. Importing the same state dir twice is a no-op (unique on `(source_path,
  source_run_id)`). The 2026-11 run dirs under the journal's `figma-loop/runs/*/state` import with the same command.
- Reads: `queryRuns({sql, params})` read-only (`query_only` pragma on the connection), returns rows and column names; the CLI prints
  a table or `--json`; the MCP tool `design_query` returns rows capped by the design config's reply budget, with the views listed in
  its description so the agent knows what to ask. The x-ray can call the same function over rpc later.
- Named views, each a `sqliteView` with a doc line:
  - `run_summary`: run, model, cost, minutes, per width: verdict, rows, much, pixels, checks.
  - `round_rows`: run, target, round, kind, magnitude, count.
  - `hint_vs_drawn`: run, round, node, hint component (from the stored `design_get` reply), component that rendered it (relation), same or not.
  - `kit_per_round`: run, round, component, nodes rendered, from the relation.
  - `mispairs`: run, target, node, round first paired, element then, element later, vote margin; a node whose winning path changed
    between rounds with a margin under `figmaPair.twinMargin`.
  - `lost_components`: run, round, component, from component rows of kind `component`.
- Coding rules of the design package hold: one export per file, functions only, no comments, no casts, no `any`, no `else`, no `let`,
  files under 600 lines, no new numeric constants, library first.

## Measure

Import waves 24, 25 and 26 (eighteen runs). `SELECT … FROM run_summary WHERE run_id IN (…)` yields the same done, rows, pixels, cost
and minutes as `twentyfive.md`, `twentysix.md` and `twentyseven.md`; where it differs, the hand table is checked and the view fixed or
the table corrected. `hint_vs_drawn` over `xray6`, `xray9`, `xray10`, `xray11` reproduces the kit-kept counts in `xray-build.md`.

## Left to the builder

- The exact shape of the reply union and where the tool reply types live today.
- Whether `INSERT … SELECT` over `ATTACH` needs a column list per table (it does when the runs store has more columns); generate it
  from the drizzle table objects, not by hand.
- The CLI's table printer: an existing dependency (`cli-table3` or what the CLI already uses), not hand-written.

## The query is the house query (2026-11-10, after Task 4)

Checked against swamp (`_ref/swamp/design/enablers/data-query.md`): one query primitive (a CEL predicate over a typed record), the
same predicate on the CLI, in expressions and in extension methods, a `select` projection, sort and limit, unknown fields refused with
the field list, SQLite behind it with indexes. Conciv already has that primitive: `catalogSources` in `@conciv/db` (CEL `where`
compiled to parameterized SQL, `select`, `order`, `limit`, the unknown-field error naming the fields), sources declared per extension
from drizzle tables, read through `conciv db read --from <source> --where '<cel>'` and the rpc `db.read`. The design extension already
declares fifteen sources over its tables. Tasks 1 to 4 built a second door beside it: raw SQL in `queryRuns` behind `design_runs` and
`conciv tools design runs`. That door closes.

Rulings:

1. The runs store's tables and its six views are design sources, declared beside the existing ones, read through `catalogSources`.
   `queryRuns`, the `design_runs` tool and the `runs` CLI query are removed; `runs import` stays.
2. Two members in the host first, never a workaround in the extension: `Source.table` accepts a drizzle view as well as a table; a
   `Source` may name the database it lives in, and the engine attaches `runs.db` to its connection under that name so one connection
   answers every source. The field types of a view come from its declared columns.
3. The agent's door is `design_query`: one MCP tool that is `catalogSources.read` over the design sources, its description listing the
   sources and their fields, the same `where`, `select`, `order`, `limit`. It lands when a wave needs it, not before.
4. Not taken from swamp: `--single`, the keyset cursor, SQL pushdown as a separate layer (the CEL compiles whole to SQL here).

Measure: the Task 4 queries rewritten as `conciv db read` calls yield the same rows; the x-ray can read `design_run_summary` over rpc.

## A wave is run, judged and reported by the product

The trial harness, the judge and the wave table were shell and TypeScript scripts in a scratch folder, one copy per wave. Omri's
ruling on 2026-11-10: a feature is written in the product, in the package that owns it, with its test; a script standing in for a
feature is not allowed. The shape follows swamp, where a workflow is run by name, its outputs land in the data store, and reports
are analysis functions over that store saved as data.

- **Run.** `conciv tools design trial <wave> --runs <n> --model <model> --design <ref>` starts the runs of a wave from one command;
  each run is imported into the store the moment it finishes, with no manual step and no file export. The per-wave launch scripts
  (`<wave>-one.sh`, `<wave>-runs.sh`, `<wave>-score.sh`) are gone.
- **Judge.** `conciv tools design judge <wave>` shows each run's final page and the design to a blind model at every measured
  width and writes the verdicts to `design_judgements` (run, target, width, score, reason, model), a table of the runs store and a
  read-only source. The hand `judge.mts` is gone, and the judge json files with it.
- **Report.** `conciv tools design report <wave>` writes the wave's table as markdown from `design_run_summary`,
  `design_round_rows`, `design_lowest_rendered`, `design_mispairs`, `design_lost_components` and `design_judgements`, and saves it
  under the store's home as `reports/<wave>.md`. A number in a report is the output of a source query, never of a script.
- **Rescore.** Scoring a run's final page again after a tool fix is a replay from the store (`design_stored_nodes`,
  `design_stored_fom`), not a shell lane over the run dir.

Smell ruled on at the same time: the store lived under the session scratch folder. Its home is the conciv home (`openRunsStore`
default) and nothing else.
