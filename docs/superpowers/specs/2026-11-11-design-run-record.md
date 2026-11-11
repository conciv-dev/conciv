# The design run record: everything a run produces, queryable

Supersedes `2026-11-10-design-runs-design.md` and the "still open" list of `2026-11-11-design-thesis-handoff.md`.

## Goal

Every run of the design tools is fully inspectable from the store, by query, without reading transcripts, logs or code. For
any session id or run id, one query per source returns every check with its rows, pairs, diffs, components, hints, images and
the FOM, DOM and CSSOM it measured. We look at a run, see why pairing or a diff went wrong, fix the extension, run again.

The product is the design extension plus the generic `conciv db query`. Anything only we need to improve the tools (scripts,
comparisons, a control) is not product code; it lives outside the repo and reads the store through the product's CLI.

## Out of the product (delete)

- `wave`, `lane`, `arm`: config (`shared/tolerances.ts`, `shared/arm.ts`), columns, source fields, the run-open write, every
  view use, the example's `vite.config.ts` label.
- The judge: `design:judge`, `judgements` table, `judged` view, `judgeModel` and the score config.
- Reports: `design:report`, `reports` table, `report/` folder, the `report` artifact kind and lifetime.
- `design:runs-gc`. Artifact lifetimes go with it; nothing expires.
- `wave_summary` view.
- Leftovers of the reverted import: `runs.source_path`, `runs.source_run_id` and their unique index.
- Migrations that exist only for the above, and their tests. The uncommitted edit in `packages/it/test/design.it.test.ts`
  already removes the judge, report and wave_summary tests; finish it.

## Fresh schema, old data kept

The schema is rewritten as one fresh migration set (v0, no back-compat). The product ships no code for old data.

Before the new schema first opens the store, the old `runs.db` is copied to `runs.pre-record.db` beside it by hand. A one-off
script outside the repo reads the old file and writes its 186 runs into the new schema through the product's write path or plain
SQL; fields the old runs never had stay null. The script is never committed.

## Every row knows where it came from

Swamp's model: no joins needed, because each record carries its provenance. Every per-run table carries `run` and `session`;
every per-check table also carries `target`, `round` and, where it applies, `width`. So `--where 'session == "conciv_…"'`
works on every source.

## Every check writes a round

Today 715 of 1151 `design_check` calls wrote no round (unsettled checks return early, unchanged checks return early). Every
check now writes its round with a `state`: `measured`, `unsettled`, `unchanged`, `broken`, `refused`. An unchanged round names
the round it equals (`same_as`) and copies nothing else. The tool call row points at its round, never null for a check.

## Snapshots are files with a catalog row

Swamp's model for bodies: content in files, metadata in the store, content read only when a query asks for it.

- Every artifact lives under `<conciv home>/artifacts/<run>/<target>/<round>/<width>/<kind>.<ext>` (target-level ones under
  `<run>/<target>/`, run-level ones under `<run>/`).
- The `artifacts` table is the catalog: `id`, `run`, `session`, `target`, `round`, `width`, `kind`, `path`, `content_type`,
  `size`, `checksum`, `written`.
- Kinds, per check and per width (the frame's width and every extra reflow width the check measures):
  - `dom`: the measured DOM of every conciv site (path, text, drawn, box, at, src).
  - `cssom`: the computed styles of every site, plus the stylesheets' media queries.
  - `fom`: the frame tree the check paired against.
  - `screenshot`, `diff`, `mask`: the live image, the diff image, the pixel mismatch mask.
- Kinds per target, at `design_get`: `figma` (the raw Figma response), `design` (the derived tree), `frame` (the target image).
- Kind per run, at close: `source_diff`.
- The live and diff images move out of the project state folder into this tree; `rounds.live`, `rounds.diff`, `rounds.ids`
  and the blanked-out `fom` inside `ids` go away.

## Diffs carry numbers

- Every row keeps `property`, `expected`, `actual` (the design value and the page value, as text with unit) and `delta`
  (number, null when not numeric), next to its prose `text`. `pageValue` and `designValue` stop being stripped.
- Rows graded `slightly` are stored with that grade, not dropped. The reply to the agent stays as it is today; only the record
  grows.
- `coverage.gone` names are rows of their own.
- Image mismatch ratios are columns of the round, not prose in `notes`.

## Hints are rows

`hints` table: `run`, `session`, `target`, `node`, `hint`, `round` (the round the agent was told it at, 0 for `design_get`).
The `hint_vs_drawn` view reads this table instead of parsing replies.

## Every call is recorded, refused ones too

`tool_calls` keeps every design tool call. A call the host's approval gate refused before the extension saw it is recorded with
`state: 'refused'`. If that needs a new `@conciv/extension` API, stop and ask with the options; do not add the API unasked.

## The code the agent changed

At run close, `source_diff` records the project files the agent changed during the run, as a unified diff per file. The real
product path is an external Claude session through the plugin, so the chat server's sandbox file hooks do not see these
edits. The source of the changes must be the dev server the extension already runs in (the Vite watcher and module graph),
not `git diff`. If that needs a new `@conciv/extension` API, stop and ask with the options.

## The query, swamp-style (`packages/db`, `packages/cli`)

`conciv db query` keeps its CEL `--where` (simple equalities pushed into SQL, as today) and gains:

- `--select '<CEL expression>'`: a map makes a table with its keys as headers, a scalar prints one per line. Replaces the comma
  list.
- `content` on the artifacts source: a lazy field, read from the file only when `--where` or `--select` touches it; JSON files
  parse to objects, so `--select 'content.sites.filter(s, s.drawn == false)'` works. A `--where` that touches `content` runs as
  a CEL filter on each row SQL returned.
- `--json`: `{results, total, next}`; `--single`: exactly one row or a user error naming the count; `--cursor <next>` with
  `--order`.
- An unknown field in `--where` or `--select` is a user error that lists the source's fields.

The agent's `design_query` takes the same options.

## Not in the product

- The migration script for the old data.
- Any comparison, scoring or summary across runs.
- A control: a stand-in design extension whose `design_get`, `design_check` and `design_status` record exactly what the real
  ones record (rounds, snapshots, rows, images) into a separate store file, and reply to the agent with nothing that helps
  (an acknowledgement only). It lives outside the repo, reuses the real extension's recording, and is enabled in a project in
  place of the real one. Built later, on its own.

## Tests

Product changes keep their tests in `packages/it/test/design.it.test.ts` and the existing db and cli test files, inside the
test file budget. Scripts outside the repo have no tests.
