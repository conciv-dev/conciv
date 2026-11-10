# Design runs: one store, written at the source, queried by the house query

Supersedes `2026-11-10-design-runs-store-design.md`. That document grew by patches during one day; this one is the design the
rewrite is built from. The runs code under `packages/extensions/design/src/server` (`runs.ts`, `commands.ts`, `runs-store.ts`,
`runs-tables.ts`, `runs-sources.ts`, `import-run.ts`, `views.ts`, the runs part of `relations.ts`) is
deleted and rewritten against it. The live tables in `tables.ts`, the host members of
`@conciv/db` (a source over a view, a source in an attached database) and the catalog's `projectKey` stay.

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

Two databases, one schema. `designTables(table, store)` already defines every table once and yields the per-project shape (no
run id) or the store shape (run id in every key, foreign keys, indexes, checks). That stays.

**The live database** `.conciv/conciv.db` of a project holds the current run of that project: `runs`, `targets`, `rounds`,
`rows`, `votes`, `fom`, `nodes`, `missing`, `candidates`, `widths`, `regions`, `tool_calls`, `labels`, `notes`,
`node_components`. The tools write it during the run.

**The store** `<conciv home>/runs.db` holds every finished run of every project, as the same tables keyed by `run_id`, plus
`artifacts`, `judgements` and `reports`, plus views. Only the import writes the tables; the judge writes `judgements`; the report
command writes `reports`; gc deletes. The home is the conciv home that `extensionDb` receives, nothing else, never a scratch path.

### A run carries its provenance from birth

`runs` gains, in both shapes, filled by `run start` in the project:

| column           | meaning                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project_key`    | the catalog's `projectKey` of the project dir: origin remote URL plus the path inside the repo, or the package name without git. Same for every worktree and clone |
| `branch`, `head` | the project's git branch and head commit at start, null without git                                                                                                |
| `wave`           | the name the harness gave the set of runs this one belongs to (`thirty`), null for a run outside a wave                                                            |
| `lane`           | the harness lane label inside the wave (`figma7-3`), null outside a wave                                                                                           |
| `tools_head`     | the commit of the design extension that served the run                                                                                                             |

`model`, `prompt_head`, `started`, `ended`, `cost`, `verdict` stay. `source_path` and `source_run_id` exist only in the store
shape and are written by the import as the record of where the rows came from; they are never the way to find a project.

### Written once

A run is imported once: `(source_path, source_run_id)` is unique and a second import of the same pair is refused with the run id
it already has. Store rows are never updated or deleted by anything but gc. The import copies the live tables column for column
(`INSERT … SELECT` over an attached read-only database, in one immediate transaction), and copies nothing it does not recognise:
a live column the store lacks fails the import, since that means a migration is missing, not that the data is optional.

### Artifacts have a lifetime

`artifacts` (store only): `artifact_id`, `run_id`, `kind` (`screenshot`, `source`, `transcript`, `report`), `width` (null unless a
screenshot), `path` (relative to `<home>/artifacts/`), `size`, `checksum` (sha-256), `lifetime` (`infinite`, or a duration in
days), `written`. The import stores a run's final screenshot per measured width, its final source tree as one tar, and the agent
transcript, each with the lifetime the harness passed (default: screenshots 30 days, source infinite, transcript 90 days; these are
config in `designConfig.runs`, not constants in code). `gc` deletes artifacts whose `written + lifetime` has passed and the rows
with them, and deletes imported project state dirs the harness registered (`runs gc --state`), printing each path it removed.

### Judgements and reports are data

`judgements`: `run_id`, `target_id`, `width`, `score` (1 to 5), `reason`, `judge_model`, `at`; unique on `(run_id, target_id,
width, judge_model)`. Written by the harness through the house write (`db.write` into the writable source `design_judgements`).

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

All are extension CLI commands (`conciv tools design …`), served by the same `ExtensionCliCommands` the extension already
registers, with the same `db` and `home`. One file per command under `runs/commands/`.

| command                                                                                                   | does                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `run start <model> <prompt head file> [--wave <name> --lane <label>]`                                     | creates the live run row with its provenance                                                                                       |
| `run end <verdict> <cost>`                                                                                | closes it                                                                                                                          |
| `run import <project dir> [--screenshots <dir> --source <dir> --transcript <file> --lifetime kind=days…]` | copies the project's run into the store once, stores the artifacts, returns the store run id                                       |
| `runs gc [--state]`                                                                                       | deletes expired artifacts and, with `--state`, registered project state dirs; prints what it removed                               |
| `report <wave>`                                                                                           | renders `wave_summary` and `judged` for the wave to `<home>/artifacts/reports/<wave>.md`, records it in `reports`, prints the path |

The query is `conciv db query --from design_<source>`; the write is `conciv db write --into design_judgements`. No runs-specific
query command exists.

## How an agent runs

An agent uses the extension through MCP; a run is recorded by design:run start/end and imported with design:run-import.

## What a wave looks like after this

```
conciv tools design report thirty                                    # <home>/artifacts/reports/thirty.md
conciv db query --from design_wave_summary --where 'wave == "thirty"'
conciv tools design runs gc --state
```

## Migration of what exists

The store at the scratch path holds 164 runs. It is moved once to the conciv home and migrated; rows whose project dir still exists
get `project_key`, `branch`, `head`, `wave` and `lane` backfilled from the dir and the run name, the rest keep null. Nothing else
from the scratch folder is read again.

## Left to the builder

File layout under `runs/` beyond "one export per file"; the markdown shape of the report (the present `twentynine.store.md` is the
reference); how `trial wave` waits on its lanes; the tar library for the source artifact.

## Rulings from the builder check

1. **Home scope in the host.** Extension CLI commands gain `options` (named flags with types) beside `positionals`, and a
   `scope`: `project` (today's: an RPC to the engine of the project the working directory is in) or `home` (an RPC to any live
   engine that owns the extension, found in `<home>/home.db`'s `engines` table, since extension code only runs inside an app). A
   home-scoped command opens the extension's store in the conciv home and never touches the engine's project database. `run start`
   and `run end` are project scope; `run import`, `runs gc` and `report` are home scope. The sources of the store are cataloged in
   `<home>/home.db` by the extension at load, in the `sources` table shape the project catalog uses; `conciv db query` and
   `conciv db write` resolve a source in the project catalog first, then the home catalog, and with no project around they use the
   home catalog alone, reading the store file directly. These are `@conciv/extension`, `@conciv/db` and `@conciv/cli` members and
   come first, each with its unit test.
2. **gc deletes artifacts and lanes, never runs.** Runs have no lifetime; the tables are kept. `runs gc` deletes artifact files
   past `written + lifetime` and their `artifacts` rows. `runs gc --state` deletes lane directories recorded in a store table
   `lanes` (`run_id`, `path`, `registered`) that the harness writes at import; it never reads `source_path` and never touches a
   run that has no lane row.
3. **The design render is an artifact.** Artifact kind `design`: the target's rendered image per measured width, lifetime
   infinite. The judge reads `design` and `screenshot` artifacts of a run from the store and nothing from a run dir.
4. **A lane is a copy, served and stated in one place.** `trial wave` copies the pristine host fixture into `<lane root>/<wave>/<lane>`;
   `trial serve --project <dir>` uses that dir as the vite root and keeps the state in `<dir>/.conciv`. A lane has no git, so its
   `project_key` is the fixture's package name, shared by every trial run of that fixture, and `branch` and `head` are null; the tool
   version is carried by the next ruling.
5. **The tool version is head plus fingerprint.** `tools_head` is the head commit of the checkout the design extension is loaded
   from (null for a published package, with `tools_version` the package version), and `tools_fingerprint` is the existing
   `projectFingerprint` of the extension package, so a dirty tree is told apart from its head.
6. **Existing rows migrate by SQL, old files are not adopted.** The 167 runs in the scratch store are moved once to the conciv home.
   A drizzle migration backfills `wave` and `lane` from the run dir name in `source_path` (the name up to its first `-` is the
   wave, the rest is the lane); `project_key`, `branch`, `head`, `tools_*` stay null for them. Their old `final-src` and
   transcripts are not read: they have no artifacts, and the judge json of past waves stays in the journal as history.
7. **Who migrates, and column strictness.** The store is migrated whenever it is opened: by the design server at boot and by any
   home-scoped command. The import refuses a live column the store lacks (a missing migration), and fills with null a store column
   the live database lacks (an older project).
