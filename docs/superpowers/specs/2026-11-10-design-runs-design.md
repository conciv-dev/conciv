# Design runs: one store, written at the source, queried by the house query

Supersedes `2026-11-10-design-runs-store-design.md`. The first build (10 Nov) kept a per-project live database, copied runs into
the store with an import command, bracketed each run with `run start` / `run end`, and drove measured runs with a harness CLI in
`packages/it`. Omri rejected that: the product is the extension; it records its own runs into one store; nothing a user cannot use
exists. This document is the design after that correction. The host members of `@conciv/db` (home catalog, a source over a view)
and the catalog's `projectKey` stay.

## Intent

The design tools are measured by trial runs: an agent builds a page from a design with the tools, and what the tools said at every
round is the record. The thesis "tools improve any model's result" is argued from those records across many runs, models and tool
versions. So every run must be queryable next to every other run, by the same query the product offers for everything else, with
no step a person has to remember and no file a script has to parse. Swamp is the reference shape: a run is written once with its
provenance, outputs are data in one store with a lifetime, reports are functions over that store, and one predicate language serves
CLI, RPC and extensions alike.

## Goals

- A finished run is in the store without anyone doing anything.
- A wave's table, the blind judge's verdicts and a rescoring are products of the store, never of a script.
- "Runs of this project", "runs on this model", "rows of this kind across waves" are one `where` each.
- Old run data is kept for as long as its lifetime says and deleted by a command, not by hand.

## Non-goals

- Changing the design tools' behaviour or the live tables' meaning.
- A UI over the store. The CLI, the RPC and the x-ray panel's existing reads are enough.
- Importing anything that is not a project's conciv.db. A run that left no database is not a run.

## Anti-goals

- A second query language or a raw-SQL door.
- Any number in a report computed outside a source query.
- A table script, launch script per wave, or dump file in a scratch folder.

## The data model

One database, one schema. `designTables(table, store)` defines every table once; the extension keeps only the store shape (run id in
every key, foreign keys, indexes, checks). The `'run'` shape and the per-project `.conciv/conciv.db` design tables go away.

**The store** `<conciv home>/runs.db` holds every run of every project, live and finished alike: `runs`, `targets`, `rounds`,
`rows`, `votes`, `fom`, `nodes`, `missing`, `candidates`, `widths`, `regions`, `tool_calls`, `labels`, `notes`,
`node_components`, plus `artifacts`, `judgements`, `reports`, plus views. The tools write it as they run; the judge writes
`judgements`; the report command writes `reports`; gc deletes. The home is the conciv home the extension server receives,
nothing else, never a scratch path. A project's `.conciv` folder keeps only the widget's session state and the design asset cache.

### The run record, complete

Every column a thesis query may need is on `runs` or one join away. This table is the whole list; a field not here is not recorded.

| group       | columns on `runs`                                                                                                | filled                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| who         | `session_id`, `model`, `harness`, `agent_id`                                                                     | at open, from the tool request and the session                                         |
| where       | `project_key` (catalog key: origin remote plus path for a tracked dir, package name otherwise), `branch`, `head` | at open, from git                                                                      |
| which tools | `tools_head`, `tools_version`, `tools_fingerprint`                                                               | at open, from the extension package                                                    |
| which set   | `wave`, `lane`, `arm` (`tools` or `control`)                                                                     | at open, from `designConfig.runs`                                                      |
| outcome     | `status` (TanStack `RunStatus`), `started`, `ended`, `verdict`, `cost`, `usage` (json), `error`, `error_code`    | `status` and `started` at open; the rest at close from the chat run and the last round |

One join away: `targets` and `widths` (the design: link, node, document hash, frame per width), `rounds`, `rows`, `votes`, `fom`,
`nodes`, `tool_calls` (every call with its reply or error), `artifacts` (`screenshot` and `design` per width per check,
`source_diff` once at close, `report`), `judgements`, `reports`, and the session's `chat_messages` (the prompt and the transcript,
never copied). `duration_ms` and anything else derivable is a view column.

The `source_diff` artifact is the diff of the project files the agent changed during the run, taken from the chat server's sandbox
file hooks (TanStack AI `onFileChange` with `diff()`), reached through an `@conciv/extension` server member. It is not a `git diff`
shelled from the extension.

### A run rides the house run lifecycle

The engine already has one. `@conciv/ai`'s chat server runs every agent turn through TanStack AI's `withSandbox` with a
`RunStore` (`chat_runs` in `@conciv/db`: `status` `running | interrupted | completed | failed | aborted`, `startedAt`,
`finishedAt`, `error`, `usage`, `sandboxKey`, `detachedSince`, `cancelRequested`, `driverEpoch`), a durability adapter and a
per-run NDJSON journal with an exit sentinel. A disconnect detaches the run and keeps the agent going; `sweepAbandonedRuns` at boot
marks every run left `running` as `aborted`; a cancel is `aborted` by the driver only; takeover is the driver's. The design
extension invents none of this.

A design run is the design work of one session. `runs` gains `session_id` and `status`, where `status` is TanStack's `RunStatus`
(the type imported, not redeclared), and drops nothing else.

- **Open**: the first `design_get` of a session inserts the row with `status = 'running'`, `session_id`, `model` from the tool
  request, and the provenance above. Every later write of that session carries the run id.
- **Close**: the extension listens to the host's turn end (the same `TurnHooks.end` the chat server already calls with the run's
  lifecycle record, exposed to extensions as a server member if it is not yet) and copies the terminal state onto the design row:
  `status`, `ended = finishedAt`, `cost` from `usage`, `verdict` from the last check. The write is `UPDATE … WHERE status =
  'running'`, so a late writer never flips a settled row. A session whose chat run ends `aborted` or `failed` leaves a design run
  that says so; its rounds, rows and artifacts stay, and `wave_summary` counts it in `runs` but not in `done`.
- **Boot**: because `sweepAbandonedRuns` fires `TurnHooks.end` for every run it aborts, a dead engine's design runs close at the
  next boot of that project with no extension code of their own.
- **Transcript**: the chat server's `withPersistence` already stores every message in `chat_messages`, and the journal holds the
  raw agent events for the run's life. The design store keeps no transcript artifact; a view joining a design run to its session's
  messages is the way to read it.

### Written once

A store row is never updated after its close, and never deleted by anything but gc. The exceptions are the lifecycle columns above
and `targets.unsettled`, which the tools own while the run is open.

### Artifacts have a lifetime

`artifacts` (store only): `artifact_id`, `run_id`, `kind` (`screenshot`, `source`, `transcript`, `report`), `width` (null unless a
screenshot), `path` (relative to `<home>/artifacts/`), `size`, `checksum` (sha-256), `lifetime` (`infinite`, or a duration in
days), `written`. Each check stores its screenshot per measured width and the design render it measured against, each with the lifetime from
`designConfig.runs` (default: screenshots 30 days, design renders infinite). `gc` deletes artifacts whose `written + lifetime` has
passed and the rows with them, printing each path it removed. The `source`, `transcript` kinds and the `lanes` table and
`--state` flag are gone with the harness.

### Judgements and reports are data

`judgements`: `run_id`, `target_id`, `width`, `score` (1 to 5), `reason`, `judge_model`, `at`; unique on `(run_id, target_id,
width, judge_model)`. Written by the `design:judge` command, or anyone, through the house write (`db.write` into the writable source `design_judgements`).

`reports`: `report_id`, `wave`, `path` (an artifact), `queries` (json: the source queries the report ran, with their parameters),
`at`. A report file is markdown whose every number was one of those queries' output; the queries are stored next to it so a
reader can re-run any cell.

### Views are the questions

One view per question, each a `sqliteView` in its own file under `runs/views/`, each a read-only source. The present set:
`run_summary` (per run and width: verdict, rows by magnitude, pixels, checks, cost, minutes), `round_rows` (rows per round by
kind and magnitude), `lowest_rendered`, `page_height_rows`, `broken_rounds`, `mispairs`, `lost_components`, `hint_vs_drawn`,
`kit_per_round`, and new: `judged` (run summary joined with judgements), `wave_summary` (per wave and width: done count, median
rows, median pixels, median cost, median lowest rendered). A wave table is `wave_summary` plus `judged`, nothing else. A new
question is a new view with a migration and one IT, never a script.

## The commands

All are extension CLI commands (`conciv design:<command>`), home scope, served by the `ExtensionCliCommands` the extension already
registers. One file per command under `runs/commands/`.

| command                               | does                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design:judge <wave> [--judge-model]` | for every run and width of the wave without a judgement by this model: shows the design render and the screenshot, two neutral file names, to the judge model through the Claude Code CLI and writes `judgements`; names a run and width whose artifact is missing and writes nothing for it |
| `design:runs-gc`                      | deletes expired artifacts; prints what it removed                                                                                                                                                                                                                                            |
| `design:report <wave>`                | renders `wave_summary` and `judged` for the wave to `<home>/artifacts/reports/<wave>.md`, records it in `reports`, prints the path                                                                                                                                                           |

`run start`, `run end` and `run-import` are deleted: the extension records the run itself. The query is
`conciv db query --from design_<source>`; the write is `conciv db write --into design_judgements`.

## How an agent runs, and how a run is measured

A user runs `conciv init` in a Vite project, starts the dev server, and the agent (any harness, through MCP or the CLI) calls
`design_get`, builds, calls `design_check` until `done`. That is the whole product and it records the run. A measured set is the same
thing with `designConfig.runs.wave` set in the project, as many times as wanted, on any model; then:

```
conciv design:judge thirty
conciv design:report thirty                                          # <home>/artifacts/reports/thirty.md
conciv db query --from design_wave_summary --where 'wave == "thirty"'
conciv design:runs-gc
```

## Migration of what exists

The store in the conciv home holds 173 runs. A migration adds `session_id` (null for them) and `status`, set from `ended`
(`completed` when set, `aborted` when null). Nothing is re-imported.

## Left to the builder

File layout under `runs/` beyond "one export per file"; the markdown shape of the report (the present `thirty.md` is the reference).

Settled while building:

- The session's run reaches each writer through `runs.open(request)` in the design runtime, a map from session id to the
  open run. A target is found by its latest row among the runs of this project (`project_key`); a check in a session
  whose run has closed writes into the session's new run and copies the target and its nodes there.
- `runs.model` and `prompt_head` are nullable: a tool request can carry no model, and nothing writes `prompt_head`.
- The turn end reaches an extension through `ServerResult.turnEnd(sessionId, run)`, where `run` is the chat run record
  (status, finishedAt, error with its code, usage). Running and interrupted runs are not closed.
- Votes and node components wait for their round row and are written in the round's transaction.
- The `design` artifact of a width is the design image the check measured against; a design has one image, so every
  width carries the same file until per-width frames are rendered.
- The `judge` names the target of an artifact from its folder, `<run>/<target>/<kind>-<round>-<width>.png`.

Left open: the `source_diff` artifact. The kind and its lifetime exist; nothing writes it. The chat server builds its
sandbox with `fileEvents: false`, so no `onFileChange` event reaches any middleware. Writing it needs: `fileEvents`
turned on in `packages/ai/src/server/chat-server.ts` (a recursive watcher on the project for every chat, a `git show`
per changed file, and `sandbox.file` custom chunks on every client stream); a `sandbox.onFile` hook on the
`conciv-turn` middleware passing `{path, type, diff}` to a new `TurnHooks.file`; `SessionPort.onFile` in chat and a
`ServerResult.turnFile(sessionId, file)` member in `@conciv/extension`; the design server keeping the last `diff()`
per path per session and writing one `source_diff` row at close (width null, name `source.diff`). Its test needs a
chat turn that edits a project file, which the design IT host cannot run: it boots with `harnessBin: 'true'` and no
fake harness.

## Rulings from the builder check

1. **Home scope in the host.** Extension CLI commands have `options` (named flags with types) beside `positionals`, and a `scope`:
   `project` or `home` (an RPC to any live engine that owns the extension, found in `<home>/home.db`'s `engines` table, since
   extension code only runs inside an app). Every runs command is home scope. The sources of the store are cataloged in
   `<home>/home.db` by the extension at load; `conciv db query` and `conciv db write` resolve a source in the project catalog
   first, then the home catalog, and with no project around they use the home catalog alone, reading the store file directly.
   Built; stays.
2. **gc deletes artifacts, never runs.** Runs have no lifetime; the tables are kept.
3. **The design render is an artifact.** Artifact kind `design`: the render per measured width, lifetime infinite, written by the
   check that measured against it. The judge reads `design` and `screenshot` artifacts of a run from the store and nothing else.
4. **Provenance from the project the engine serves.** `project_key` is the catalog's key of the engine's cwd: origin remote URL plus
   the path inside the repo for a tracked directory, the package name for an untracked copy; `branch` and `head` from git when
   tracked, else null. `tools_head` is the head commit of the checkout the extension is loaded from (null for a published package,
   with `tools_version` the package version) and `tools_fingerprint` the extension package's `projectFingerprint`.
5. **The store is migrated whenever it is opened**, by the design server at boot and by any home-scoped command.
6. **One writer per run.** The engine whose session opened the run is the only writer of its rows while it is `running`. Another
   engine reading the store sees the run through views only. SQLite in WAL mode carries the concurrent engines.
7. **The old per-project live database is dropped, not migrated.** A project's `.conciv/conciv.db` design tables hold at most one
   unfinished run; nothing reads them after this change, and the design migrations for the `'run'` shape are deleted.
