# Design Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every trial run lands in one store by itself, with its provenance, and every wave number, judgement and report is a product of that store through the house query.

**Architecture:** The live tables stay. The runs code and the trial harness are deleted and rebuilt: the host gains options and a home scope for extension commands plus a home catalog; the design extension gains provenance at `run start`, a strict import with artifacts, gc, report and views as sources; `packages/it` gains a real `trial` CLI (serve, wave, judge, rescore). Rewrite, not patch: each task deletes what it replaces.

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

1. A second `run import` of the same project returns the first run id and changes no row (unique pair, no partial copy).
2. `run import` on a project whose live db has a column the store lacks refuses with the column name, and copies nothing.
3. `runs gc --state` never deletes a path that is not in `lanes`; a run imported without a lane row is untouched.
4. `conciv db query --from design_run_summary` from a directory with no project reads the home catalog and works.
5. `trial judge` on a run whose `design` or `screenshot` artifact is missing names the run and width and writes no judgement.

---

### Task 1: options and scope on extension commands, home catalog, home-scoped `db`

**Files:**

- Modify: `packages/extension/src/types.ts` (`ExtensionCliCommand`), `packages/extension/src/extension-db.ts`
- Modify: `packages/db/src/source-types.ts` (`CatalogCommand`), `packages/db/src/catalog-schema.ts`, `packages/db/src/source-catalog.ts`, `packages/db/src/home-schema.ts`, a new `packages/db/src/home-catalog.ts`
- Modify: `packages/cli/src/extension-commands.ts`, `packages/cli/src/local-catalog.ts`, `packages/cli/src/db.ts`, `packages/cli/src/request.ts`
- Test: `packages/db/test/home-catalog.test.ts`, `packages/cli/test/extension-commands.test.ts` (match the existing test layout of each package)

**Interfaces:**

- Produces: `ExtensionCliCommand = {description; positionals: readonly string[]; options?: Record<string, {type: 'string' | 'boolean' | 'number'; description: string; multiple?: boolean}>; scope?: 'project' | 'home'; run(input: {args: string[]; options: Record<string, string | number | boolean | string[]>; db; home}) => unknown}`
- Produces: `CatalogCommand` gains `options` (json) and `scope`; `sources` catalog rows in `home.db` under the same `sources` table; `homeCatalog(home: string): {sources: ReturnType<typeof catalogSources>; commands: CatalogCommand[]}` in `@conciv/db`.
- Produces: in the CLI, `localCatalog()` returns the project catalog merged over the home catalog (project first), or the home catalog alone with no project; a `scope: 'home'` command is sent by `runRpc` to the first live engine from `listEngines(openHomeDb(home))` whose project catalog lists the extension.

- [ ] Step 1: Failing unit tests. `home-catalog.test.ts`: `sourceCatalog({extension, sources, home, database: 'runs'})` writes rows into `<home>/home.db` and `homeCatalog(home).sources.list()` returns them; a project catalog over the same name wins in `localCatalog`. `extension-commands.test.ts`: a command with `options: {wave: {type: 'string'}}` and `scope: 'home'` renders `--wave` and is dispatched with `{args, options: {wave: 'thirty'}}` to the engine picked from `engines`.
- [ ] Step 2: Run them; they fail on missing members.
- [ ] Step 3: Implement the types and the catalog writes; generate the `@conciv/db` migrations for `sources` and `commands` (`options`, `scope`) in both the project catalog and `home.db`.
- [ ] Step 4: Implement the CLI: `option()` from `@bomb.sh/router` per declared option; `runRpc` with `scope`.
- [ ] Step 5: Gates in `db`, `extension`, `cli`; the new tests pass; existing tests pass.
- [ ] Step 6: Commit `host: extension commands take options and a scope, and a home catalog serves the store`.

### Task 2: the store schema, views and sources, old runs code deleted

**Files:**

- Modify: `packages/extensions/design/src/server/tables.ts` (`runs` columns), `packages/extensions/design/src/shared/tolerances.ts` (`designConfig.runs`: artifact lifetimes in days)
- Create: `packages/extensions/design/src/server/runs/{open-store.ts, store-tables.ts, sources.ts, relations.ts}`, `runs/views/{run-summary.ts, round-rows.ts, lowest-rendered.ts, page-height-rows.ts, broken-rounds.ts, mispairs.ts, lost-components.ts, hint-vs-drawn.ts, kit-per-round.ts, judged.ts, wave-summary.ts, index-of-views.ts}` (the last exports `runsViews`)
- Delete: `src/server/{runs.ts, commands.ts, runs-store.ts, runs-tables.ts, runs-sources.ts, import-run.ts, views.ts}`, the runs part of `relations.ts`, `drizzle-runs/` (regenerated)
- Test: `packages/it/test/design-runs.it.test.ts` (new; the runs tests move out of `design.it.test.ts`)

**Interfaces:**

- Produces: `runs` gains `project_key text`, `branch text`, `head text`, `wave text`, `lane text`, `tools_head text`, `tools_version text`, `tools_fingerprint text` in both shapes; store-only tables `artifacts(artifact_id pk, run_id fk, kind enum design|screenshot|source|transcript|report, width real, path text, size integer, checksum text, lifetime text, written integer)`, `lanes(run_id fk unique, path text, registered integer)`, `judgements(run_id fk, target_id, width, score integer check 1..5, reason text, judge_model text, at integer; unique(run_id,target_id,width,judge_model))`, `reports(report_id pk, wave text, artifact_id fk, queries json, at integer)`.
- Produces: `openStore(home: string): {file; orm; close}` migrating on open; `storeSources(): Record<string, Source>` (every store table as `stored_<name>`, every view by name, `judgements` writable).
- Produces: views `wave_summary(wave, width, runs, done, median_rows, median_pixels, median_cost, median_lowest_rendered)` and `judged(run, wave, lane, target, width, verdict, rows, pixels, score, reason)`; the nine present views ported file by file with their SQL unchanged.

- [ ] Step 1: Failing IT: a store opened in a temp home has every table and view as a source; `wave_summary` over two inserted runs gives `done` counts and medians; `judgements` accepts a `db.write` and refuses one with `score: 6`.
- [ ] Step 2: Run it; fails.
- [ ] Step 3: Implement; `pnpm gen-migrations` for both migration folders; delete the old files and fix every import.
- [ ] Step 4: Gates; `design.it.test.ts` with the runs tests removed still passes; the new IT passes.
- [ ] Step 5: Commit `design: the runs store schema, its views and sources, rebuilt`.

### Task 3: `run start` and `run end` write provenance

**Files:**

- Create: `src/server/runs/commands/run-start.ts`, `run-end.ts`, `provenance.ts` (`provenanceOf(input: {cwd: string; extensionDir: string}): Promise<{project_key; branch; head; tools_head; tools_version; tools_fingerprint}>`), `src/server/runs/commands/design-commands.ts` (exports `DESIGN_COMMANDS`)
- Modify: `src/server.ts` to register them

**Interfaces:**

- Consumes: `projectKey` and `projectFingerprint` from `server/catalog/`.
- Produces: `run start <model> <prompt head file> --wave <name> --lane <label>` (project scope) inserting one `runs` row with every provenance column; `run end <verdict> --cost <n>`.

- [ ] Step 1: Failing IT in `design-runs.it.test.ts`: `run start` in a git fixture dir yields `branch`, `head`, `project_key = <remote>#<prefix>`, `tools_fingerprint` non-null, `wave`, `lane`; in a dir without git, `project_key` is the package name and `branch` null.
- [ ] Step 2: Fails. Step 3: implement. Step 4: gates. Step 5: Commit `design: a run carries its provenance from run start`.

### Task 4: `run import` with artifacts and lanes, strict columns, one-time move of the store

**Files:**

- Create: `src/server/runs/commands/run-import.ts`, `src/server/runs/import/{copy-run.ts, store-artifacts.ts, column-check.ts}`
- Create: a drizzle migration in the store folder that backfills `wave` and `lane` from `source_path` with `substr`/`instr` as the spec says

**Interfaces:**

- Produces: `run import <project dir> --screenshots <dir> --design <dir> --source <dir> --transcript <file> --lane <dir> --lifetime <kind=days>…` (home scope) returning `{runId, imported, copied, artifacts}`; artifacts written under `<home>/artifacts/<runId>/`; `lanes` row when `--lane` given.

- [ ] Step 1: Failing ITs: import twice returns the same id and `imported: false`; a live db with an extra column refuses naming it; a live db missing `wave` imports with null; artifacts rows and files exist with checksums; the backfill migration splits `twentyfour-figma7-1/state` into `twentyfour` and `figma7-1`.
- [ ] Step 2: Fails. Step 3: implement. Step 4: gates. Step 5: Commit `design: a run is imported once, with its artifacts and its lane`.
- [ ] Step 6: Move the scratch store once: copy `runs.db` from the scratch home into the conciv home, open it with `openStore` so it migrates; report `design_runs` count through `conciv db query`.

### Task 5: `runs gc` and `report`

**Files:**

- Create: `src/server/runs/commands/runs-gc.ts`, `report.ts`, `src/server/runs/report/{render-wave.ts, queries.ts}`

**Interfaces:**

- Produces: `runs gc [--state]` printing `{removed: string[]; kept: number}`; `report <wave>` writing `<home>/artifacts/reports/<wave>.md`, a `reports` row with the queries json, printing the path.

- [ ] Step 1: Failing ITs: an artifact written with lifetime 0 days is removed and one with infinite kept; `--state` removes a registered lane dir and leaves an unregistered dir; `report` for a wave with two runs renders a table whose cells equal `wave_summary` and `judged` reads.
- [ ] Step 2: Fails. Step 3: implement. Step 4: gates. Step 5: Commit `design: gc deletes expired artifacts and lanes, report renders the store`.

### Task 6: the `trial` CLI

**Files:**

- Create: `packages/it/src/trial/{trial.ts (bin), serve.ts, wave.ts, judge.ts, rescore.ts, lane.ts, host-server.ts, open.ts, inject-widget.ts, read-commands.ts}` porting the pieces of `scripts/design-trial.ts`
- Create: `packages/it/test/fixtures/trials/figma7/{src/, assets/, prompt.md, head.txt}`, the wave 28 inputs
- Delete: `packages/it/scripts/design-trial.ts`; `package.json` `trial` script points at the bin
- Test: the `trial` and `run start and run end` describes in `packages/it/test/design.it.test.ts`

**Interfaces:**

- Produces: `pnpm trial serve --project <dir> … [commands…]` with the commands `get`, `check`, `status`, `screenshot`, `run start <model> <head file>`, `turn <prompt file>`, `run end [<verdict> [<cost>]]`, `quit`, ending with `conciv design:run-import` of the project and printing `store run <id>`; `pnpm trial wave <name> --runs <n> --model <m> --design <kind:ref>… --trial <dir> [--route] [--lane-root] [--no-agent]` printing `<lane> store run <id>` per lane; `pnpm trial judge <wave> [--model opus]` writing `design_stored_judgements`; `pnpm trial rescore <run> <round>` replaying the pairer from `design_stored_nodes`, `design_stored_fom`, `design_stored_votes` and printing rows before and after. The turn limit is `designConfig.runs.turnMs`.

- [x] Step 1: Failing IT: `trial serve` with no agent and two stdin commands lands a run in `design_run_summary` and `design_stored_artifacts` has a `design` and a `screenshot` per width; `trial wave` with `--runs 1 --no-agent` lands a run with its wave, lane and the `design_status` verdict; `trial judge` on a run with a missing artifact names it and writes nothing; `trial rescore` on an imported run prints a before/after count; an untracked copy is keyed by its package name with no branch or head.
- [x] Step 2: Fails. Step 3: implement. Step 4: gates. Step 5: Commits `it: the trial harness is a CLI that runs, judges and rescores through the store`, `it: a wave drives each lane's agent and lands its runs in the store`, `design: an untracked copy is keyed by its package name`, `it: the transcript page size is config`.

### Task 7: wave thirty through the product

- [ ] From `packages/it`, with the Figma key from `~/.zshrc`: `pnpm trial wave thirty --runs 6 --model sonnet --trial test/fixtures/trials/figma7 --route '/?variant=agency' --design figma:https://www.figma.com/design/V1Ty9hzxZiyT32hKXNekD0/x?node-id=50-533 --design figma:https://www.figma.com/design/V1Ty9hzxZiyT32hKXNekD0/x?node-id=100-1106 --design figma:https://www.figma.com/design/V1Ty9hzxZiyT32hKXNekD0/x?node-id=100-1468`; `pnpm trial judge thirty`; `conciv design:report thirty`; `conciv design:runs-gc --state`.
- [ ] Report: the report path, `conciv db query --from design_wave_summary --where 'wave == "thirty"'` output, disk before and after. No table outside the report.
