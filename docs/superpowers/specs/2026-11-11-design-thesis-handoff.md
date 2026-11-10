# The design thesis: state, product path and next steps

Handoff for a fresh session. Read this, then `2026-11-10-design-runs-design.md` (the store), then
`packages/extensions/design/README.md` (the tools). Everything else in `docs/superpowers` about trials, lanes, waves, harnesses or
imports is history.

## The thesis

An agent on any model, given a Figma design, builds a page that matches it when it has the conciv design tools (`design_get`,
`design_check`, `design_status`), and does not without them. The product is the design extension. The thesis is tested by using
the product the way a user does, and read from the store the extension writes.

## The product path (the only path)

1. A real project with conciv mounted: `apps/examples/tanstack-start` has `conciv()` in `vite.config.ts` as `conciv init` leaves it.
   The design extension is enabled in that project's conciv config the way any extension is enabled. Nothing else is wired.
2. `pnpm dev` in that project. The page opens with the conciv widget and the engine.
3. Claude runs in that folder through the installed conciv claude plugin (`conciv-connect`), the same as for a user. One prompt:
   build the page from the three figma7 frames (links in the fixture `packages/it/test/fixtures/design/`, node ids 50-533 at 1920,
   100-1106 at 1440, 100-1468 at 390). The Figma key comes from the user's shell, is never printed, logged or written.
4. The agent calls `design_get`, builds, calls `design_check` until `done`. The extension records the run into the store as it
   happens. No one types anything else.
5. Afterwards: `conciv db query --from design_run_summary --order=-run --limit 1`, and the rounds of that run for what the agent
   was told at each check. For a scored comparison: `conciv design:judge <wave>` then `conciv design:report <wave>`.
6. A fix goes into `packages/extensions/design` with a test in `packages/it/test/design.it.test.ts`, then one more run, same model.

Forbidden, because it was built and torn down on 10 to 11 Nov: a runner CLI, lane copies of a fixture, a run bracket command
(`run start/end`), an import step from a project database, an engine started by a script for a command, a prompt tweak instead of
a tool fix, a table or compare script, a judge run before any run reaches `done`.

## State of the code (branch `design-catalog`, worktree `/Users/omrikatz/Public/web/aidx-catalog`)

Done and in the branch:

- The design tools and five pairer fixes from waves 27 to 30 (overlap against the shifted box, breakpoint tolerance, displaced
  row, twins by reading order, mispair margin). Measured: same model (sonnet), same three frames, agents reaching `done` went from
  1 of 6 to 4 of 6, median rows left from 5.5 to 0 at 390.
- The store `<conciv home>/runs.db` (173 runs from waves 1 to 30), 17 views as `design_<view>` sources, `conciv db query` over
  them, `design:runs-gc`, `design:report`. Home-scoped extension commands run through a live engine (ruling 1 of the runs spec).
- The harness, `run start/end` and `run-import` reverted (commits bd96185cf to c8633a178, de154aabd).

In flight when this document was written (an opus agent on Tasks 8 to 12 of `docs/superpowers/plans/2026-11-10-design-runs.md`,
its report not yet in):

- Task 8: the extension writes the store directly, run row created at the first `design_get` with the full record of the runs spec
  ("The run record, complete"); the per-project design tables and migrations deleted.
- Task 9: the run closes with the chat run (`@conciv/ai`'s TanStack AI run store: status, usage, error) through a turn-end member on
  `@conciv/extension`.
- Task 10: screenshot and design-render artifacts written by each check; `design:judge`.
- Task 11: a page far taller than its design is a row and cannot be `done`.
- Task 12: docs, the real store migrated on open.
  Check `git log` for which landed. Verify each against its test before trusting the report.

Still open after that, in order:

1. `source_diff` artifact at close from the chat server's sandbox file hooks (TanStack AI `onFileChange` with `diff()`), through an
   `@conciv/extension` server member. Not a `git diff` from the extension.
2. The first real-product run (section above). Read its rounds. Fix what stopped the agent.
3. The 2 of 6 wave-30 runs that ended `not-yet` with rows they could not clear: read `design_round_rows` for runs 169 and 170 and
   decide whether the rows were wrong or the agent was.
4. Control arm runs (`designConfig.runs.arm = 'control'`: same prompt, extension tools off) so `design_wave_summary` compares.
5. The other four designs (figma2, figma3b, figma5, figma6 inputs are in the session scratch folder under `figma<n>/`; copy only what
   a run needs into the test fixtures, once) and a weaker model.

## Rules that stand

Commit locally only, never push, never open a PR, no attribution lines, never amend, rebase or stash. Subagents on opus. One
export per file, functions only, no comments, no casts, no `any`, no `else`, no `let`, no regex, library first, no new numeric
constants (durations and defaults in `designConfig.runs`). Tests inside `design.it.test.ts` (budget 3 files, a ruling). Every
number from a source query. Never kill a process you did not start. Remove worktrees and lanes you created when done. Never edit
`aidx`, `aidx-key*`, `aidx-demo`, `aidx-loop`, `aidx-verbs`, `aidx-wt-*`, `_ref`, `mono`.

## Known defects of the tools, from the store

- A page that rendered as a 569k px blank strip at 390 passed `design_check` with 3 rows (run 169). Task 11 addresses it.
- The judge gave 4 of 5 to 17 of 18 widths of wave 30; the rubric saturates. Not urgent until runs are compared.
- Agent tool errors seen in wave 30 logs (`NO_PAGE_CLIENT`, `PAGE_TIMEOUT`, `no-live-widget: design_measure`) are recoverable by the
  agent but cost turns; `tool_calls` records them, a view over them does not exist yet.
