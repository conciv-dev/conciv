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

Landed after this document was first written (verified: diffs read, design IT 86 of 87, the one failure a load-dependent
`PAGE_TIMEOUT` in the broken-page test that passes alone):

- 8c0e402b8 Task 8: the extension writes its runs to the store at the first `design_get`, with the full run record (`session_id`,
  `status`, `arm`, `harness`, `agent_id`, `usage`, `error`, `error_code`, provenance). Per-project design tables and migrations
  deleted; `lanes` and gc `--state` gone; the real store migrated (173 runs: 168 completed, 5 aborted).
- 2738063ce Task 9: the run closes with the chat run through `ServerResult.turnEnd(sessionId, run: TurnRun)` wired from the chat
  server's turn end and boot sweep. `source_diff` is NOT written: the chat server builds its sandbox with `fileEvents: false`, and
  the IT host has no fake harness that edits files. Open item 1 below.
- ee11f9676 Task 10: each check writes `screenshot` and `design` artifacts per width under `<home>/artifacts/<run>/<target>/`;
  `conciv design:judge <wave> [--judge-model]` (default `designConfig.runs.judgeModel = opus`), not yet run on real artifacts.
- 8e45c467e Task 11: the measure reply carries `scrollHeight`; a body far taller than the frame is a row, verdict not `done`.
- 135d1d1b3 Task 12: README Runs section; the superseded store spec deleted.

The first real-product run (section above, wave label `thirtyone`, lane `example-1`, sonnet) was dispatched at 01:45 on 11 Nov; its
result is in the session scratch `w31/` logs and in the store. Read `design_run_summary` for the latest run before anything else.

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

## Real-product runs so far (11 Nov, night)

**Run 1** (01:53, 85 s, $0.50, no store row): the agent never reached a design tool. Found and fixed in the product: the Claude
plugin bridge sent no MCP protocol headers so the server was `failed` at session start (048143db8); a vite that failed to bind still
overwrote `.conciv/server.json` and orphaned the live engine (fce909c2a); `--figma` was not repeatable and the agent guide taught
removed commands (a5ef0fdc9). Not a code defect: the browser must be authorized once (the widget's Authorize button and the
`#conciv_otp=` link the dev server prints) and Claude approved once in the tab; "The product path" step 2 means those two clicks.

**Run 2** = store run 174 (02:58, 17 min, 94 turns, $2.82, sonnet, wave `thirtyone`, lane `example-1`): the agent built a complete
/design page (screenshot in the session scratch `w33/design-1440.png`) but `design_check` measured nothing in 18 checks. Rounds 1,
4, 7, 9, 11: "The page rendered no design nodes" (the target was pinned to route `/`, the tab's route at `design_get`, while the
page was at `/design`). Rounds 2, 3, 5, 6, 8, 10, 12: `broken`, "ResizeObserver loop completed with undelivered notifications" (a
benign browser message treated as a runtime error). The run row stayed `running` after the agent and the dev server ended: an
external session has no chat-server turn end. Also seen: the hub's `external_design_get` handed code-mode a string (`cannot read
property 'map' of undefined`); the widget reopened a dead session so `conciv tools tabs` listed no tab until a session was picked by
hand; a `page_eval` call failed `APPROVAL_DENIED` before the user could approve; `conciv init` reported the plugin step failed
although every sub-step passed; the session picker's options render off-screen at 1200 px. Two fix tasks were dispatched at 03:35
(design extension: route, ResizeObserver, external-session close, `wave` in `run_summary`; core/widget/cli: the other five). Check
`git log 8abedf806..HEAD` for what landed.

**Run 3** = store runs 175, 176, 177 (04:12 to 04:52, 40 min cap, $6.44, the sonnet parent delegated the whole job to one
opus subagent, so this is an opus run): **`design_check` said `done` at all three widths** (round 6 at 1440 and 390, round 7 at
1920; rows went 115/88/85 at round 2, 15/42/10 at 3, 13/8/6 at 5, 2/0/0 at 6, 0 at 7). Screenshots in the session scratch
`w34/design-1440.png` and `design-390.png`. Three store runs because every dev-server restart opens a new run. Defects seen, the
run's cost in minutes in brackets:

- TanStack devtools' `injectSource` stamps `data-tsd-source` first and conciv defers to it, so the page had no conciv stamps
  and the check measured 0 nodes [the agent read conciv's source and disabled devtools inject-source in vite.config.ts, 12 min].
  The zero-nodes hint ("call design_get with route set") pointed the wrong way.
- The browser's authorization is lost at every dev-server restart (the OTP trust is per engine process) [two more Authorize clicks].
- A session id changes across restarts; the agent's pinned tab id then fails "not open in any of the 4 running conciv dev
  servers" (the other three engines are other worktrees' dev servers).
- `design_get` through the CLI returned `APPROVAL_DENIED` three times over 10 minutes instead of waiting, and with the widget
  panel collapsed the only sign was the launcher label; the agent needs the "Allow claude" click to surface. Those refused calls
  are not recorded in `design_stored_tool_calls`.
- `mcp__conciv-hub__discover_tools` was truncated at 50,000 characters, so the agent dropped MCP and used the CLI.
- SIGINT dispose did not close run 177 (`running`, no `ended`); a config-change restart did close 175 and 176 as `aborted`.
- Conciv's on-disk stamping rewrote Footer.tsx, Header.tsx and ThemeToggle.tsx with `data-conciv-key`, and the server and client
  keys differ (38 hydration mismatch warnings).
- `conciv init` refuses to run over the AGENTS.md and CLAUDE.md its previous run wrote ("uncommitted changes").
- Session-level: Fable dispatched a build agent in the same worktree during the live run; its `dist` rebuilds reloaded the page,
  broke the widget ("failed to start widget") and showed "Engine is running outdated code". Never build in a worktree while a
  run uses it.

**After run 3** (05:00 to 06:30) eight fixes landed: conciv stamps over TanStack devtools inject-source (91a1bd3df), server and
client mint the same key (258018c16), a stale tab id is refused with the tabs open now (b5624e8e7), `discover_tools` is never
truncated (f944d9eee), init runs over its own AGENTS.md (9fc154a03), a restarted dev server keeps its engine port so the browser
stays trusted (938f7a3d3, 2acd29539), SIGINT disposes the engine and closes the run (328023e75); external sessions end through
`sessionEnd` on hub detach, dead pid or dispose (f09632393, 6dd17dd7b, 8ee0a3df3). Open for Omri: a design call refused before the
extension sees it (the "allow claude" gate, which does wait the decision wait) is recorded nowhere; recording it needs either a
host tool-calls table joined by a design view (recommended, the refusal is a host event) or a nullable run on `design_tool_calls`.

**Run 4** = store run 178 (06:16, 8 min, $1.27, 46 turns, sonnet itself): no check ran. Fable's own flag `--setting-sources
project` (meant to keep the user's global CLAUDE.md from making sonnet delegate to opus) also dropped the conciv plugin and the
hub MCP from the session, so the agent used only the CLI; never use that flag, `--disallowedTools Agent` alone stops delegation.
Product defects: the CLI's `design_check` answered `NO_PAGE_CLIENT` "the page is showing another session" while the trusted tab
was open on the targets' own session; `design_run_summary` has no row for a run without rounds (178 invisible); the key write-back
stamped `data-conciv-key` into five source files and changed design.tsx under the agent's edit. Fix agent dispatched 06:34.

**After run 4** fixes: CLI design calls resolve the open tab's session (b1feb00d8), `run_summary` lists runs without rounds
(c586761cf), keys carried over in memory, no source rewrite (e34c82f44), a reloaded tab keeps its session and never takes an
outside agent's (ca6d9b3f6), path flags (d4363fe17).

**Run 5** = store run 179 (07:21, 6.6 min, $1.27, 36 turns, sonnet, CLI only, hub still `pending`): all five fixes held
(round 1 rendered nodes with devtools on, no NO_PAGE_CLIENT while the tab lived, session id stable across reloads, no source file
rewritten, SIGINT closed the run `aborted` 9.39 min). No `done`: the first `design_get` had no `--route` so the targets pinned to
`/` and rounds 1 and 2 measured the starter home (73/105/78 rows); the agent re-registered with `--route /design`, the three-link
call moved only the first target, and during those re-registering calls (9.9 s and 5.2 s each) the headed Chromium tab crashed
("Page crashed and was reset to about:blank"), after which every check answered `no widget connected to session`. The page agent
also closed the machine's `default` playwright session (not product). Fix agent dispatched 07:45 (route applies to every target of
the call and the run; the crash's cause and a clear after-crash error).

**After run 5** fixes: a `design_get` route moves every target of the run and a re-put keeps the frame in its set, so no
re-registration (ebfd05259); a tab that went without its goodbye is named "crashed; reload it" (8a3ec0762). The Chromium crash
itself was a renderer null pointer during the (now removed) asset rewrite, not proven to be conciv's.

**Run 6** = store runs 180, 181 (08:12, 8.3 min, $1.29, 43 turns, sonnet, CLI only, hub connected): one round, measured the
starter home at `/` again (no `--route`, 73/105/78 rows); then the live tab dropped out of `tabs` after a Vite full reload
(the agent's route-file moves) and every page tool said "the page is showing another session" until a manual full navigation;
the agent fell back to its own browser (run 181, two refused checks) and stopped. Fix agent dispatched 08:36: the tab after a full
reload, and the product leading the agent to `--route` (init guide, tool description, low-coverage reply).

## Known defects of the tools, from the store

- A page that rendered as a 569k px blank strip at 390 passed `design_check` with 3 rows (run 169). Task 11 addresses it.
- The judge gave 4 of 5 to 17 of 18 widths of wave 30; the rubric saturates. Not urgent until runs are compared.
- Agent tool errors seen in wave 30 logs (`NO_PAGE_CLIENT`, `PAGE_TIMEOUT`, `no-live-widget: design_measure`) are recoverable by the
  agent but cost turns; `tool_calls` records them, a view over them does not exist yet.
