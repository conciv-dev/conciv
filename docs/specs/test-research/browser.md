# Browser test layer (layer 3): how it is written, what it costs, fixtures, rewrites

Repo: /Users/omrikatz/Public/web/aidx at 476a97995 (origin/main). Timing data: CI run 44537686715 (baseline, main 58b649460),
cross-checked against runs 44542062949 and 44547323365. Timing source: per-test lines in the vitest default
reporter of the shard logs (`run-*/clean|logs/*.log`) and the per-package `cases` of `shard-report-shard-*.json`.
The vitest JSON reports (`test-results.json`) were NOT kept in the baseline: the shard reports only carry
package name + title + duration (no file, no hook time). The default reporter prints every test of a file that has a
failure, and only tests over 300 ms otherwise, so "parsed" counts are partial for green files. There is no direct
hook timing; I measure hook cost as (file duration - sum of its test durations), which in vitest is the
beforeAll/afterAll time (beforeEach/afterEach count inside the test). Parser: `scratchpad/scripts/parse.py`,
outputs `scratchpad/t1.json`, `run-44542062949.json`, `run-44547323365.json`.

Docs used: WebFetch of vitest.dev/guide/test-context, vitest.dev/guide/browser/commands and
playwright.dev/docs/test-fixtures. vitest.dev/guide/browser/ and /config/browser/ pages did not carry the option detail;
for `browser.trace` / `screenshotFailures` I read the vitest 5.1.0 types in node_modules
(`BrowserTraceViewMode = "on" | "off" | "on-first-retry" | "on-all-retries" | "retain-on-failure"`,
`screenshotFailures?: boolean`). Pinned: vitest 5.1.0 + @vitest/browser-playwright 5.1.0
(pnpm-workspace.yaml:139,217), playwright / @playwright/test ^1.64.1 (:80,:182), @solidjs/testing-library ^0.8.10 (:95),
storybook ^10.6.5 (:207; addon-vitest 10.6.5 installed).

---

## a. How the browser suites are written

### Four runner styles

| Style                                                                                      | Where                                                                                                                                                                                                                                          | Browser lifecycle                                                                                                                                                                                                          | Engine (core) lifecycle                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. vitest browser mode (test code runs IN Chromium, node side reached via BrowserCommands) | apps/conciv (`browser`, `perf`), ui-kit-chat, ui-kit-chat-tools, ui-kit-system, ui-kit-tap, ui-kit-terminal, builtin-plugins (chromium + firefox), page, plugin, solid-streamdown, brand, brand-react, mascot (`mascot-browser`), mascot-react | one page per file, test file runs in the vitest iframe; `fileParallelism: false` in every project (e.g. apps/conciv/vitest.config.ts:52) so files of a package run one at a time                                           | apps/conciv only: `commands.bootCore` (apps/conciv/test/commands/core-control.ts:161) boots an in-process core in node, state keyed by `ctx.testPath` (:132), "already booted" guard (:163). Called from `bootedCore()` beforeAll per describe (helpers.browser.tsx:845-858)                                                  |
| B. vitest node + Playwright library through `@conciv/browser-fixture`                      | plugins whiteboard, tanstack, test-runner, try-it, recorder (`recorder.it`), react/preact/solid `widget.it`                                                                                                                                    | file-scoped `browser` fixture: `chromium.launch()` once per file, `{scope: 'file'}` (packages/browser-fixture/src/browser-fixture.ts:7-20); tests call `browser.newPage()`                                                 | per test inside the test body via `openPluginWidget` (plugin-testkit/src/widget-suite.ts:105-130: bootCoreKit + static host + newPage + magic-link goto). try-it boots once per describe (try-it.browser.test.ts:104-108). `widgetComponentSuite` already uses file-scoped `kit`/`host` fixtures (widget-suite.ts:133-152)    |
| C. Playwright Test                                                                         | packages/embed (`embed.it`), packages/mascot (`mascot.it`), e2e/*                                                                                                                                                                              | built-in `page` fixture = fresh BrowserContext per test (Playwright docs: "Isolated context for this test run"); embed also uses `context.newPage()` (embed.it.test.ts:112,129) and `browser.newPage()` in beforeAll (13x) | embed: mix of per-test `test.beforeEach(bootEmbedKit)` (setupWidgetSuite helpers.ts:240-258, setupProxiedEmbedSuite :266-282, embed.it.test.ts:76,1138) and per-describe `test.beforeAll` (13x, e.g. :484,:672,:1234). e2e: one `webServer` per app (`vite --port N --strictPort --force`, e2e/e2e-utils/src/config.ts:81-87) |
| D. Storybook vitest addon                                                                  | apps/storybook                                                                                                                                                                                                                                 | `maxWorkers: 2`, `isolate: false`, reducedMotion context (apps/storybook/vitest.config.ts:21-34)                                                                                                                           | none                                                                                                                                                                                                                                                                                                                          |

### Per-suite table (static counts at HEAD; script `scratchpad/scripts/count.py`)

Columns: tests = `it(`/`test(` lines; bAll/bEach/aEach = hooks; poll = `expect.poll`/`.toPass`; waitFor = `vi.waitFor`/`waitForFunction`;
until = hand-rolled `until()` from harness-testkit (until.ts:16, a 10 ms setTimeout loop); sleep = real `setTimeout` waits;
toOpt = explicit `timeout:` options; eval = `page.evaluate`. `waitForTimeout`, `networkidle` and `newContext(` are 0 in every file.

| File                                                               | lines                                | tests        | bAll                   | bEach | aEach | poll | waitFor | until | sleep                                                    | toOpt | eval | CI file time                      |
| ------------------------------------------------------------------ | ------------------------------------ | ------------ | ---------------------- | ----- | ----- | ---- | ------- | ----- | -------------------------------------------------------- | ----- | ---- | --------------------------------- |
| apps/conciv/test/conciv.browser.test.tsx                           | 13018                                | 322          | 3 (+52 via bootedCore) | 0     | 51    | 22   | 4       | 2     | 0                                                        | 444   | 0    | 1084 s (335 tests, 26 red)        |
| apps/conciv/test/helpers.browser.tsx                               | 935                                  | -            | 2                      | 0     | 5     | 0    | 0       | 0     | 0                                                        | 1     | 0    | -                                 |
| packages/embed/test/e2e/embed.it.test.ts                           | 3001                                 | 74 (76 run)  | 13                     | 8     | 9     | 6    | 1       | 14    | 0                                                        | 140   | 5    | 283.5 s chromium + 58.7 s firefox |
| packages/mascot/test/e2e/mascot.it.test.ts                         | 2866                                 | 79 (102 run) | 0                      | 12    | 0     | 0    | 0       | 0     | 18 `wait(`/`sleep(` (helpers.ts:229-232 real-clock wait) | 0     | 80   | 78.5 s                            |
| packages/builtin-plugins/test/builtin-plugins.browser.test.tsx     | 2837                                 | 114          | 5                      | 0     | 0     | 0    | 4       | 0     | 3 (`setTimeout(fire,40/50)` :979,:990,:1100)             | 5     | 0    | 32.2 s chromium + 9.5 s firefox   |
| packages/ui-kit-chat/test/composer.browser.test.tsx                | 2056                                 | 58           | 0                      | 0     | 0     | 1    | 0       | 0     | 0                                                        | 15    | 0    | 48.0 s (one 30.5 s red)           |
| packages/ui-kit-chat/test/thread.browser.test.tsx                  | 1969                                 | 56           | 0                      | 1     | 0     | 0    | 0       | 0     | 0                                                        | 38    | 0    | 7.8 s                             |
| packages/ui-kit-chat/test/cards.browser.test.tsx                   | 1277                                 | 50           | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 4     | 0    | 5.1 s                             |
| packages/ui-kit-chat/test/markdown.browser.test.tsx                | 325                                  | 11           | 0                      | 0     | 0     | 0    | 0       | 0     | 1 (16 ms, :300)                                          | 0     | 0    | 5.1 s                             |
| packages/ui-kit-system/test/ui-kit-system.browser.test.tsx         | 1587                                 | 71           | 0                      | 0     | 6     | 0    | 0       | 0     | 2 (`pause(RESET_MS*0.7/0.6)` :133,:199,:201)             | 0     | 0    | 22.9 s                            |
| packages/ui-kit-chat-tools/test/ui-kit-chat-tools.browser.test.tsx | 765                                  | 37           | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 0     | 0    | 33.0 s (one 30.5 s red)           |
| packages/page/test/page.browser.test.tsx                           | 1199                                 | 58           | 3                      | 1     | 6     | 3    | 2       | 0     | 0                                                        | 0     | 0    | 2.5 s                             |
| packages/plugin/test/plugin.browser.test.tsx                       | 305                                  | 6            | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 0     | 0    | 0.7 s                             |
| packages/solid-streamdown/test/solid-streamdown.browser.test.tsx   | 441                                  | 10           | 0                      | 0     | 0     | 0    | 0       | 0     | 2 (0 ms ticks :415,:434)                                 | 0     | 0    | 4.3 s                             |
| packages/ui-kit-tap/test/ui-kit-tap.browser.test.tsx               | 176                                  | 6            | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 0     | 0    | 1.8 s                             |
| packages/ui-kit-terminal/test/terminal.test.tsx (runs in Chromium) | 395                                  | 15           | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 1     | 0    | 2.1 s                             |
| packages/mascot/test/browser/solid-mascot.browser.test.tsx         | 286                                  | 21           | 0                      | 0     | 0     | 0    | 3       | 0     | 0                                                        | 0     | 0    | 1.4 s                             |
| packages/mascot-react/test/browser/react-wrapper.browser.test.tsx  | 356                                  | 23           | 0                      | 0     | 0     | 0    | 3       | 0     | 0                                                        | 0     | 0    | 1.3 s                             |
| packages/brand(-react)/test/browser/*-lockup.browser.test.tsx      | 76 / 94                              | 4 / 4        | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 0     | 0    | 4.5 s / 4.6 s                     |
| packages/plugins/whiteboard/test/whiteboard.browser.test.ts        | 1197                                 | 3            | 0                      | 0     | 0     | 1    | 0       | 0     | 0                                                        | 29    | 0    | 61.6 s                            |
| packages/plugins/recorder/test/recorder.it.test.ts                 | 835                                  | 11           | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 52    | 1    | 42.0 s                            |
| packages/plugins/tanstack/test/tanstack.browser.test.ts            | 323                                  | 1            | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 7     | 0    | 20.9 s                            |
| packages/plugins/test-runner/test/test-runner.browser.test.ts      | 401                                  | 5            | 0                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 22    | 0    | 18.0 s                            |
| packages/plugins/try-it/test/try-it.browser.test.ts                | 204                                  | 3            | 1                      | 0     | 0     | 0    | 0       | 0     | 0                                                        | 7     | 0    | 9.3 s                             |
| packages/{react,preact,solid}/test/widget.it.test.ts               | 5 each (call `widgetComponentSuite`) | 3 each       | file fixtures          |       |       |      |         |       |                                                          |       |      | 4.6 / 4.6 / 7.4 s                 |
| apps/storybook (137 story files)                                   | -                                    | 445          |                        |       |       |      |         |       |                                                          |       |      | 39.7 s                            |

Other wait facts:

- conciv.browser has 2,254 `expect.element` calls (auto-retrying) of which 212 carry `{timeout: 8000}` and 207 carry `{timeout: 15_000}`;
  12 `vi.useFakeTimers` (allowed). Per-test budgets of 30 s-120 s are set by trailing numbers (e.g. :206 `120_000`).
- embed.it: 50 `test.setTimeout(90_000..240_000)` (e.g. :98,:182) and expect timeouts up to `MOUNT_TIMEOUT_MS = 20_000` (:876);
  the config gives `expect: {timeout: 30_000}`, `timeout: 60_000` (packages/embed/playwright.config.ts:13-14).
- The hand-rolled `until` (harness-testkit/src/until.ts:16-28) duplicates `expect.poll` / `vi.waitFor`; used 14x in embed.it, 2x in conciv.
- mascot.it: 80 `page.evaluate` DOM/geometry reads (open ruling 1 in the spec) and 18 real-clock `wait(ms)` calls.

### Concurrency, retries, artifacts

- Timeouts everywhere: `TEST_TIMEOUT_MS = HOOK_TIMEOUT_MS = 30_000`, `teardownTimeout: 30_000`
  (packages/vitest-config/src/reporters.ts:17-18,41). Plugin node suites raise `testTimeout` to 120 s (e.g. whiteboard/vitest.config.ts:10).
- `fileParallelism: false` in every browser project (apps/conciv/vitest.config.ts:52; ui-kit-chat :55; builtin-plugins :19;
  plugins/* vitest.config.ts:11-14). `maxWorkers` only from `VITEST_MAX_FORKS` (reporters.ts:21-25) or ui-kit-terminal `VITEST_MAX_WORKERS ?? 3`.
  Playwright: `workers: 1`, `fullyParallel: false`, `retries: 0` (embed playwright.config.ts:11-16, mascot same, e2e config.ts:76).
- Retries: none anywhere (no vitest `retry`, Playwright `retries: 0`).
- Traces: Playwright `trace: 'retain-on-failure'` (embed/mascot), uploaded only from `packages/embed/test-results/` (.github/workflows/ci.yml:142-150).
  Vitest browser projects set no `browser.trace`; `screenshotFailures` is left at its default (apps/conciv/test/**screenshots** exists).
- Coverage: `ciTest()` turns v8 coverage on under GITHUB_ACTIONS (reporters.ts:42-47); browser packages report none (baseline.md notes).
- CI sharding: `conciv-ci-shards plan` LPT-bin-packs WHOLE PACKAGES by last timings into 2..8 shards, target 150 s
  (packages/vitest-config/src/shards.ts:28-37,98-128); each shard runs `turbo run typecheck lint test --filter=<pkg>...` per package
  (ci-shards.ts:34,84-87). The smallest unit is a package, so a package is never split; vitest's own `--shard` (file-level) is not used.
  e2e: same planner, 300 s target, 2..5 shards, `--concurrency=1` (shards.ts:39-45, ci-shards.ts:40).
- Storybook: own job, `maxWorkers: 2`, `isolate: false` (apps/storybook/vitest.config.ts:21-22).

### Wall-clock: what dominates

CI run wall 21m59s = shard-1 at 21m25s; next shard 10m45s (baseline.md, "CI job wall times"). Shard-1 is @conciv/app at 1106.7 s,
i.e. one file, `conciv.browser.test.tsx`, is the critical path of the whole CI run.

conciv.browser, three runs (parsed: every test is printed because the file has failures):

| run         | file     | sum of tests | hooks (file - tests) | failed: n / time | passed time |
| ----------- | -------- | ------------ | -------------------- | ---------------- | ----------- |
| 44537686715 | 1084.1 s | 1072.9 s     | 11.3 s               | 26 / 572.7 s     | 500.1 s     |
| 44542062949 | 1111.2 s | 1099.7 s     | 11.5 s               | 27 / 594.2 s     | 505.6 s     |
| 44547323365 | 1083.2 s | 1073.4 s     | 9.8 s                | 29 / 621.2 s     | 452.2 s     |

- Red tests are 53-58% of the file. 20 of the 26 failures end at 15.3-17.2 s = the `{timeout: 15_000}` element wait; the others at the 30 s test
  timeout or the 45/60/90 s custom budgets.
- Engine boot is cheap: 52 `bootedCore` boots+closes cost 9.8-11.5 s in total = ~0.2 s each.
- Passing tests (run 1): median 0.65 s, p90 5.0 s; 31 tests >= 5 s take 261 s (52% of passing time). Of those, 13 are `terminal panel`
  (real PTY CLI; the describe sums 103 s / 20 tests) and ~9 are Retry/offline/reconnect tests that wait out real product timers
  (TanStack Query retries: `QUERY_CORE_BROWSER_DEFAULT_RETRIES = 3` at :3823, reconnect windows `SECOND_HANDSHAKE_WINDOW_MS` :2711-2714,
  `OUTAGE_WINDOW_MS` :11939-11942).
- Per describe (run 1): `a fixture plugin driven like a user` 449.5 s / 23 tests (mostly red), `terminal panel` 103.1 s, `chat history paging` 97.0 s,
  `engine login` 70.2 s, `settings page` 60.1 s (one red test).

Other suites:

- embed.it chromium: 76 tests, 283.5 s, min 0.12 s / median 2.8 s / p90 7.4 s; the three `forced drop > ... chat stream giving up` tests take
  27.9 + 12.5 + 11.9 s: the client walks its reconnect backoff to the "reconnect ceiling" (embed.it.test.ts:930,949) in real time.
- whiteboard.browser: 61.6 s for 3-4 tests, all in test bodies (boot is inside the test); 37.7 s single journey.
- tanstack.browser: one 20.8 s journey (vite-builds a host app inside the file, tanstack.browser.test.ts:62).
- e2e: 222.8 s summed Playwright test time over 3 shards whose walls are 6m30, 4m45, 4m02: the job time is install + build + `webServer`
  start (`vite --force` re-optimizes deps on every start, e2e-utils/src/config.ts:84 via each app's command), not the tests.

### Top 20 slowest browser tests (run 44537686715)

| #   | ms    | status | file                                                               | test                                                                                                                                              |
| --- | ----- | ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 90269 | red    | apps/conciv/test/conciv.browser.test.tsx                           | a fixture plugin driven like a user > a plugin that throws from its panel focus, its panel list or its reactive slot loses only that contribution |
| 2   | 60077 | red    | conciv.browser                                                     | settings page > a journey through every settings tab that saves, applies, survives a reload and resets                                            |
| 3   | 45220 | red    | conciv.browser                                                     | a fixture plugin driven like a user > a page overlay that hides the chat takes the chat out of reach by role and by Tab                           |
| 4   | 37693 | pass   | packages/plugins/whiteboard/test/whiteboard.browser.test.ts        | the whiteboard canvas > opens from its composer pill, draws with the keyboard and the pointer ...                                                 |
| 5   | 30517 | red    | packages/ui-kit-chat-tools/test/ui-kit-chat-tools.browser.test.tsx | tool row projections > projects a Write call as a write row and an Edit call as an edit row                                                       |
| 6   | 30475 | red    | packages/ui-kit-chat/test/composer.browser.test.tsx                | assistant action bar reveal > says the copy did not land when the clipboard refuses a keyboard-activated copy                                     |
| 7   | 30228 | red    | conciv.browser                                                     | chat history paging > scrolling up loads the older page well before the top ...                                                                   |
| 8   | 30027 | red    | conciv.browser                                                     | chat history paging > the replies on screen are kept, not rebuilt, when the page before them lands                                                |
| 9   | 27947 | pass   | packages/embed/test/e2e/embed.it.test.ts (chromium)                | forced drop > a queued message survives the chat stream giving up > the queued text is back in the composer ...                                   |
| 10  | 20839 | pass   | conciv.browser                                                     | session selector > a user opens, searches, pages, picks by keyboard and by pointer ...                                                            |
| 11  | 20768 | pass   | packages/plugins/tanstack/test/tanstack.browser.test.ts            | the tanstack plugin in the page > shows its chip as a passive status ...                                                                          |
| 12  | 17825 | pass   | conciv.browser                                                     | terminal panel > the toolbar picks the CLI model and keeps it across a reload ...                                                                 |
| 13  | 17172 | red    | conciv.browser                                                     | a fixture plugin driven like a user > its tool card body comes back after the thread evicts it ...                                                |
| 14  | 16459 | red    | conciv.browser                                                     | a fixture plugin driven like a user > its tab shows once trusted, through a revoke ...                                                            |
| 15  | 16100 | red    | conciv.browser                                                     | a fixture plugin driven like a user > its engine ref reads the event connection ...                                                               |
| 16  | 16000 | red    | conciv.browser                                                     | a fixture plugin driven like a user > its panel reads the routed session idle ...                                                                 |
| 17  | 14942 | pass   | conciv.browser                                                     | launcher activity > a session whose row fails to load says so where the title is ... Retry brings the title back                                  |
| 18  | 13126 | pass   | conciv.browser                                                     | engine login > Retry on the unreachable screen checks the login again ...                                                                         |
| 19  | 12479 | pass   | embed.it (chromium)                                                | forced drop > ... a queue lost while the pane shows another session ...                                                                           |
| 20  | 12064 | pass   | conciv.browser                                                     | chat history paging > Latest glides to the newest message from far up ...                                                                         |

Passing-only continues: embed forced drop #3 11.9 s, whiteboard comments 10.2 s and 9.6 s, terminal panel 9.5 / 9.3 s,
connect agents 9.2 s, embed model selector retry 9.1 s, terminal reduced motion 8.5 s, embed firefox reload 8.5 s.

---

## c. Fixture layers, the library way

### What the libraries give (pinned versions)

- Vitest 5.1 `test.extend`: object syntax (Playwright-compatible) with `[fn, {scope: 'file' | 'worker', auto}]`, or the 4.1+ builder
  `.extend('name', fn)` where the fn's second argument provides `onCleanup` (one per fixture). Scope rules: worker fixtures may depend only on
  worker fixtures; file fixtures on worker/file; test fixtures on everything. Suite hooks can reach only file/worker fixtures.
  `test.override` (4.1+) changes fixture values for a describe, but non-test fixtures cannot be overridden inside a describe
  (only at module top level, or by `{injected: true}` + project `provide`). Already used in-repo: browser-fixture.ts:7-20, widget-suite.ts:133-152.
- In browser mode the fixtures run in the browser runtime, so a file fixture there reaches node only through BrowserCommands
  (`commands.bootCore`, core-control.ts). The command context has `testPath`, `page` (orchestrator), `frame()`/`iframe`, `context`.
- Playwright Test `test.extend`: test fixtures by default, `{scope: 'worker'}`, `{auto: true}`, `{timeout}`, `{box: true}`; option fixtures
  (`[default, {option: true}]`) are set per describe with `test.use({...})` (embed already uses `test.use({viewport})`, embed.it.test.ts:179).
  The built-in `page` is in a fresh `context` per test.

### Proposed layers

| Layer                         | Scope                                                                                                                                                                                                                                                                            | vitest browser mode (apps/conciv, ui-kits)                                     | vitest node + browser-fixture (plugins)                                                                                                    | Playwright Test (embed, mascot, e2e)                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 0 browser                     | file                                                                                                                                                                                                                                                                             | provided by vitest (one page per file)                                         | `browser` (exists, browser-fixture.ts)                                                                                                     | built in (worker)                                           |
| 1 widget bundle + static host | file                                                                                                                                                                                                                                                                             | n/a (app built from source by vite)                                            | `widgetHost`: `serveFiles(dirname(bundle))` or a `viteHost(entry)` file fixture (try-it :79-98 and tanstack :62 build the same host twice) | `widgetHost` worker fixture (serveWidgetHost helpers.ts:74) |
| 2 engine                      | test by default, with an `engineOptions` option overridden per describe (`test.override` in vitest, `test.use` in Playwright). Boot is ~0.2 s, so per-test is cheap and kills the 51 afterEach resets; a file-scoped `engine` only where a journey file needs one default engine | `engine`: `commands.bootCore(engineOptions)` + `onCleanup(commands.closeCore)` | `engine`: `bootCoreKit(engineOptions)` + `kit.cleanup`                                                                                     | `engine`: `bootEmbedKit(engineOptions)`                     |
| 3 page                        | test                                                                                                                                                                                                                                                                             | `shell` (mountShell + dispose), `pane` (mountPane + dispose)                   | `widgetPage`: newPage + magic-link goto + close in teardown (openPluginWidget split into engine/host/page)                                 | `page` (built in) + `loggedInPage`                          |
| 4 faults/observers            | test, auto-cleanup                                                                                                                                                                                                                                                               | `faults` (install/release; trackedFaults)                                      | `faults` on the page: failRpcCalls/gateRpcCalls/holdRpcCalls, rpcObserverFor, rpcSocketFor                                                 | same as plugins                                             |
| 5 user steps                  | test (plain object over the page)                                                                                                                                                                                                                                                | `widget.open/composer/send/approve/...`                                        | `chat.send`, `openPanel`, `login`, `openPluginWidget`, `approve`                                                                           | same                                                        |

### Helper map (every helper in today's browser files and testkits)

apps/conciv/test/helpers.browser.tsx

| helper                                                                           | line                                                                                                                                                                            | moves to                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| coreControl (=commands)                                                          | 107                                                                                                                                                                             | engine fixture internals                                        |
| coreRpc / closeHelperClients                                                     | 115 / 121                                                                                                                                                                       | `engine.rpc` (closed in engine teardown)                        |
| createSession                                                                    | 125                                                                                                                                                                             | `engine.newSession()`                                           |
| seedDraft                                                                        | 130                                                                                                                                                                             | `engine.seedDraft()`                                            |
| runTurn / sendTurn                                                               | 169 / 180                                                                                                                                                                       | `engine.runTurn()` / `engine.sendTurn()` (turns from elsewhere) |
| mountPane (+ AnnounceLog)                                                        | 307                                                                                                                                                                             | `pane` test fixture                                             |
| createShellHarness (mountShell, dispose, pathname, href, back)                   | 471                                                                                                                                                                             | `shell` test fixture; `widget.open(path)` wraps mountShell      |
| registerCalmCore                                                                 | 659                                                                                                                                                                             | calm-perf suite only: `engine` + `calm` fixture                 |
| startMultiToolRun / startBoundaryRun / streamCodeAnswer / glideToLatestFromFarUp | 774 / 786 / 807 / 826                                                                                                                                                           | `calm` user steps                                               |
| bootedCore                                                                       | 845                                                                                                                                                                             | delete: `engine` fixture + `test.override({engineOptions})`     |
| keptPane                                                                         | 861                                                                                                                                                                             | delete: `pane` fixture teardown                                 |
| trackedFaults                                                                    | 878                                                                                                                                                                             | `faults` fixture                                                |
| HERO_GRAB, HERO_LABEL, persistedGrab, grabProviderFor                            | 892-909                                                                                                                                                                         | data module (not fixtures)                                      |
| memoryStorage                                                                    | 915                                                                                                                                                                             | `storage` test fixture                                          |
| expectRetryRecovers                                                              | 925                                                                                                                                                                             | user step `widget.expectRetryRecovers`                          |
| conciv.browser local helpers                                                     | 571 definitions, 419 names; `editor` x14 (:3879,:4323,...), `input` x10, `readLocalCopy` x10, `composer` x8, `stopButton` x6, `launcher` x6, `picker` x5, `titleButton` x4, ... | one `widget` page object (locators + steps)                     |

apps/conciv/test/commands/core-control.ts (BrowserCommands; stay as the node side of the engine fixture)

| command                                                                                                                                                                    | line                      | moves to                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| bootCore / closeCore                                                                                                                                                       | 161 / 230                 | `engine` setup / `onCleanup`                                                                   |
| forwardConnectPort / closeConnectForward                                                                                                                                   | 210 / 228                 | `engine.forwardConnectPort()` (teardown closes)                                                |
| pagePluginPaths, writeProjectFile, projectFileExists                                                                                                                       | 247-256                   | `engine.project`                                                                               |
| chatStreamsOpened, rpcSocketsRevoked/Opened, rpcCallCount, rpcStartedCount, rpcStartedOnceServed, rpcMark, awaitRpcFailedCount, awaitRpcSocketLive, awaitRpcSocketsRevoked | 259-264, 411-457, 736-743 | `engine.wire` observer                                                                         |
| printedCode / requestCode                                                                                                                                                  | 266 / 276                 | `login` user step                                                                              |
| revokeBrowsers, setHubConnection, hubExecute, setStaleness, fakeHubCli                                                                                                     | 282-310, 361              | `engine.admin`                                                                                 |
| holdTurn/releaseTurn, releaseTranscripts, holdTools/releaseTools, holdResults/releaseResults, scriptTurn, scriptError, clearScript, scriptCustomEvent                      | 314-353                   | `engine.script` (released in engine teardown, replaces afterEach in registerCalmCore :671-677) |
| installFault / releaseFault / awaitFaultAnswered / faultPending / awaitFaultPending                                                                                        | 694-723                   | `faults` fixture                                                                               |
| dragButton / hoverButton / chooseFiles / downloadFrom                                                                                                                      | 764-792                   | `widget` user steps (pointer/file/download)                                                    |

packages/embed/test/helpers.ts

| helper                                                                        | line                    | moves to                                                |
| ----------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| bootEmbedKit                                                                  | 34                      | `engine` fixture (option `engineOptions`)               |
| serveWidgetHost, hostPage, handleHostPage                                     | 74, 118, 129            | `widgetHost` worker fixture + host html options         |
| browserBase                                                                   | 107                     | `widgetHost.base`                                       |
| openLoggedIn                                                                  | 113                     | `loggedInPage` test fixture                             |
| reserveDeadPort, proxyTo                                                      | 139, 163                | `deadPort` / `proxy` test fixtures (closed in teardown) |
| setupWidgetSuite, setupProxiedEmbedSuite                                      | 240, 266                | delete: fixtures                                        |
| chatLog, chatBox                                                              | 292, 296                | `widget` locators                                       |
| requestLoginCode, logInFromPanelNoticeWithCode, logInFromPanelNotice          | 300, 304, 313           | `login` user step                                       |
| openChatPanel, sendChatMessage, openPanel, openPanelOnNewSession, sendMessage | 317, 323, 424, 442, 452 | `chat.open`, `chat.send`                                |
| untilPanelDraft                                                               | 328                     | `expect.poll` in a user step (drop `until`)             |
| mountHandle, openHostWithHandle, remountHandle, unmountHandle, rebindHandle   | 357-383                 | `handle` user steps                                     |
| captureNativePosts, installNativeStub                                         | 392, 403                | `native` test fixture                                   |
| awaitTabAttached                                                              | 413                     | `engine.awaitTabAttached`                               |
| switchToSessionByTitle                                                        | 432                     | `chat.switchSession`                                    |

packages/plugin-testkit/src (exports)

| helper                                                                                | file:line                                                                    | moves to                                                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| bootCoreKit                                                                           | core-kit.ts:44                                                               | `engine` fixture (all styles)                                                                                   |
| openPluginWidget                                                                      | widget-suite.ts:105                                                          | split into `engine` + `widgetHost` + `widgetPage` fixtures; keep a `openPluginWidget` user step for second tabs |
| serveStaticDir                                                                        | widget-suite.ts:39                                                           | `widgetHost` file fixture                                                                                       |
| widgetComponentSuite                                                                  | widget-suite.ts:132                                                          | keep (already file fixtures)                                                                                    |
| listenLocal                                                                           | listen-local.ts:3                                                            | fixture internals                                                                                               |
| failRpcCalls, abortRpcCalls, garbleRpcReplies, holdRpcCalls, gateRpcCalls             | rpc-fault.ts:70,81,87,100,128                                                | `faults` test fixture (auto-dispose)                                                                            |
| failChatTurns, dropChatTurns                                                          | chat-fault.ts:8,12                                                           | `faults`                                                                                                        |
| rpcSocketFor                                                                          | rpc-socket.ts:83                                                             | `widgetPage` setup (installed before goto)                                                                      |
| rpcObserverFor / observeRpc, rpcCallCursor / rpcCallMark, watchRpcWire, watchChatWire | rpc-observer.ts:190/80, rpc-counts.ts:10/21, rpc-wire.ts:18, chat-wire.ts:51 | `wire` test fixture                                                                                             |
| completeConnectHandshake                                                              | connect-handshake.ts:8                                                       | `connect` user step                                                                                             |
| currentHref                                                                           | navigation-state.ts:3                                                        | `engine.currentHref`                                                                                            |
| makeImageHostGrab, makeHostGrab                                                       | host/grab.ts:41,50                                                           | data helpers                                                                                                    |

packages/harness-testkit/src (browser-relevant)

| helper                                                               | file:line                                       | moves to                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| magicLink, trustedBrowserToken                                       | login.ts:54,58                                  | `widgetPage` / `login`                                                            |
| requestPrintedCode, exchangePrintedCode, loginThroughTerminal        | login.ts:27,40,46                               | `login` user step                                                                 |
| until                                                                | until.ts:16                                     | delete for browser tests: `expect.poll` / `vi.waitFor` / Playwright `expect.poll` |
| approvePending, autoApprove, withAutoApproval, makeApprovingCallTool | call-tool.ts:180,131,147,173                    | `approve` user step (engine side)                                                 |
| createFakeHarness, makeScriptedRun                                   | create-fake-harness.ts:127, scripted-run.ts:190 | inside `engine`                                                                   |

packages/mascot/test/e2e/helpers.ts: openMascotPage :636, openIdleService :708, openStreamService :713 -> `mascotPage` fixture;
readGaze :731, tipUnderTransform :748, expectedEmitterGeometry :766, medianStep :793, collectLaunches :815, expectNear :829 are geometry
math (open ruling 1). packages/browser-fixture: `test` with `browser` :7 -> layer 0, keep.

---

## d. Efficiency changes (estimates from the measured numbers)

| #   | Change                                                                                                                                                                                                                                                                            | Estimate                                                                                                                                                        | How estimated                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Get conciv.browser green and fail fast: one config default for element/poll waits instead of 419 per-call `{timeout: 8000/15_000}`; per-test budgets only where a journey needs it                                                                                                | red runs: 573-621 s of failure time; 20 of 26 reds sit at 15.3-17.2 s, so a ~5 s default saves ~10 s each = ~200 s per red run; green: the whole 573-621 s goes | per-run failed sums above                                                                                                                                                                                                                                                                 |
| 2   | Product timers become options the test shortens (standing rule): TanStack Query retry delay in the widget's query client, rpc reconnect backoff/ceiling, slow-handshake window                                                                                                    | conciv ~50-60 s, embed ~40 s, whiteboard ~25 s                                                                                                                  | conciv: ~9 retry/reconnect tests of 6-15 s, each waiting ~7 s of default query backoff (3 retries at 1+2+4 s, :3823) or 2-6 s windows (:2711-2714,:11939-11942); embed: 3 `forced drop` tests 52.3 s walk to the reconnect ceiling; whiteboard: 10 s + 15 s waits listed in spec ruling 4 |
| 3   | CI critical path: the run wall equals shard-1 (21m25s), which is @conciv/app alone (1107 s). After #1 it drops to ~500 s of green tests, below the next shard (10m45s). Further cuts in conciv.browser stop shortening CI below ~10.7 min unless embed/unplugin shards shrink too | ~10 min off the CI wall (21m59s -> ~11-12 min)                                                                                                                  | 1107 s - ~600 s red time; next-largest shard wall from baseline.md                                                                                                                                                                                                                        |
| 4   | Journeys instead of per-behaviour tests (spec rule 3)                                                                                                                                                                                                                             | <= ~45 s on conciv                                                                                                                                              | 114 conciv tests under 0.5 s average 0.23 s; that is the ceiling of per-test fixed cost; 309 -> ~120 tests                                                                                                                                                                                |
| 5   | Shared engine (file/worker scope)                                                                                                                                                                                                                                                 | small: <= ~15 s on embed (76 per-test boots), ~0 on conciv                                                                                                      | boot+close = 9.8-11.5 s / 52 boots = ~0.2 s. Pick engine scope for isolation, not speed                                                                                                                                                                                                   |
| 6   | Plugin suites: file-scoped `widgetHost` and one `viteHost` build per file instead of per test / per describe                                                                                                                                                                      | a few s per file                                                                                                                                                | try-it file 9.3 s vs 5.4 s of tests = ~3.9 s of build+boot in beforeAll                                                                                                                                                                                                                   |
| 7   | Delete `until` and real sleeps (ui-kit-system `pause(RESET_MS*0.7)` :199-201, mascot `wait(ms)` x18, builtin-plugins `setTimeout(fire, 40/50)`)                                                                                                                                   | no time, removes timing guesses                                                                                                                                 | rule 6                                                                                                                                                                                                                                                                                    |
| 8   | Traces on failure for vitest browser projects (`browser.trace: 'retain-on-failure'`) and upload them like embed's                                                                                                                                                                 | debug time, not CI time                                                                                                                                         | ci.yml:142-150 uploads embed traces only                                                                                                                                                                                                                                                  |
| 9   | e2e: the job is setup, not tests (222.8 s of tests in ~15 min of shard walls); `vite --force` re-optimizes deps on each server start                                                                                                                                              | not measured: needs a run without `--force`                                                                                                                     | e2e-utils config.ts:84 + app commands                                                                                                                                                                                                                                                     |
| 10  | Budget rule vs sharding: with one browser file per package and package-level LPT shards, the biggest browser file is always one job                                                                                                                                               | ruling needed only if green conciv > ~640 s                                                                                                                     | shards.ts:98-128 bins packages; vitest `--shard` is file-level                                                                                                                                                                                                                            |

Not worth it: `fileParallelism: true` (after the rewrite every package has one browser file, so nothing to parallelize); vitest
`describe.concurrent` in browser mode (tests share one page).

---

## e. Two real journeys rewritten on the fixtures (report only, no edits)

### 1. apps/conciv: "a session whose row fails to load ..." (conciv.browser.test.tsx:3826-3867, 14.9 s; describe at :3645)

Today: `bootedCore` beforeAll per describe (:3646), `createShellHarness` + manual `harness.dispose()` in afterEach (:3647-3654),
`trackedFaults` registering its own afterEach (:3648), local locators (`composer`, `titleButton`, `statusBar`) redefined in many
describes, `sessionThatRan` local helper (:3682-3689), `{timeout: 8000/20_000}` on single asserts, and a wait through the real
query backoff (`QUERY_CORE_BROWSER_DEFAULT_RETRIES`, :3823).

Fixtures (apps/conciv/test/fixtures.browser.tsx, vitest 5 builder syntax):

```tsx
export const test = base
  .extend('engineOptions', {id: 'fake'} as EngineOptions)
  .extend('engine', async ({engineOptions}, {onCleanup}) => {
    const booted = await commands.bootCore({...engineOptions, allowedOrigins: [location.origin]})
    onCleanup(() => commands.closeCore())
    return engineHandle(booted)
  })
  .extend('faults', async ({engine}, {onCleanup}) => {
    const faults = faultSet(commands)
    onCleanup(faults.releaseAll)
    return faults
  })
  .extend('widget', async ({engine}, {onCleanup}) => {
    const shell = createShellHarness(() => engine.base)
    onCleanup(shell.dispose)
    return widgetPage(page, shell)
  })
```

Journey:

```tsx
describe('launcher activity', () => {
  test.override({engineOptions: {id: 'launcher-activity', queryRetryDelayMs: 0}})

  test('a session whose row fails to load says so where the title is, keeps its menu and its chat, and Retry brings the title back', async ({
    engine,
    faults,
    widget,
  }) => {
    const sessionId = await engine.sessionThatRan('a row that failed to load')
    const broken = await faults.fail(['sessions', 'get'], {status: 500})
    await widget.open(`/panel/${sessionId}?open=true`, {viewport: {width: 1000, height: 900}})

    await expect.element(widget.titleButton('Session')).toBeVisible()
    await expect.element(widget.text('Hello from conciv')).toBeVisible()
    await widget.type('still talking while the row is failed')
    await expect.element(widget.composer).toHaveTextContent('still talking while the row is failed')
    await expect.element(widget.alert('Couldn’t load this session')).toBeVisible()
    await expect.element(widget.alert('Couldn’t load this session').getByRole('button', {name: 'Retry'})).toBeVisible()
    await expect.element(widget.titleButton('This session could not be loaded')).toBeVisible()
    await expect.element(widget.titleButton('New session')).not.toBeInTheDocument()

    await widget.openSessionOptions('This session could not be loaded')
    await widget.closeDialog('Session options')

    const mark = await engine.wire.mark()
    await widget.send()
    await expect.element(widget.log.getByText('still talking while the row is failed')).toBeVisible()
    await expect.element(widget.text('Hello from conciv').nth(1)).toBeVisible()
    await expect.element(widget.status('conciv replied.')).toBeInTheDocument()
    await engine.wire.awaitFailed(['sessions', 'get'], {status: 500, count: ROW_REFETCH_ATTEMPTS, since: mark})
    await expect.element(widget.alert('Couldn’t load this session')).toBeVisible()

    await faults.release(broken)
    await widget.retry(widget.alert('Couldn’t load this session'))
    await expect.element(widget.titleButton('a row that failed to load')).toBeVisible()
    await expect.element(widget.alert('Couldn’t load this session')).not.toBeInTheDocument()
  })
})
```

Kept: every assert of :3826-3867. Gone: the per-describe boot, the afterEach dispose/releaseTurn, per-call timeouts, the
local helpers. `queryRetryDelayMs` is a new engine/widget option (needs a ruling per "never extend API without asking"); with it
the test no longer waits ~7 s of real backoff.

### 2. plugins/try-it: "covers the panel with the connect steps, then hands off ..." (try-it.browser.test.ts:118-156)

Today: `held` object filled in beforeAll (:102-114) and null-checked in the test (:121-122), a hand-made TCP forwarder (:67-77)
and connect-port binder (:34-42) closed in `finally`, two `browser.newPage()` closed by hand (:125-127,:151-152); test 3 (:185-202)
has no `finally`, so a failure leaks its pages.

Fixtures (object syntax, as browser-fixture.ts and widget-suite.ts already do):

```ts
const test = browserTest.extend<{
  $file: {site: ServedDir; ledger: ProbeLedger; engine: CoreKit}
  $test: {tab: (query: string) => Promise<TryItTab>; agent: {connect: () => Promise<void>}}
}>({
  site: [
    async ({}, use) => {
      const site = await serveStaticDir(await hostFolder())
      await use(site)
      await site.close()
    },
    {scope: 'file'},
  ],
  ledger: [
    async ({}, use) => {
      const ledger = await probeLedger()
      await use(ledger)
      await ledger.close()
    },
    {scope: 'file'},
  ],
  engine: [
    async ({site}, use) => {
      const kit = await bootCoreKit({id: 'try-it', text: 'hello from try-it', allowedOrigins: [site.base]})
      await use(kit)
      await kit.cleanup()
    },
    {scope: 'file'},
  ],
  tab: async ({browser, site}, use) => {
    const pages: Page[] = []
    await use(async (query) => {
      const page = await browser.newPage()
      pages.push(page)
      await page.goto(`${site.base}/?${query}`, {waitUntil: 'domcontentloaded'})
      return tryItTab(page)
    })
    await Promise.all(pages.map((page) => page.close()))
  },
  agent: async ({engine}, use) => {
    const forward = forwardTo(Number(new URL(engine.base).port))
    const bound: {current?: Listening} = {}
    await use({
      connect: async () => {
        bound.current = await onConnectPort(forward.server)
      },
    })
    forward.sockets.forEach((socket) => socket.destroy())
    await bound.current?.close()
  },
})
```

Journey:

```ts
test('covers the panel with the connect steps, then hands off in place to the core that answers', async ({
  engine,
  tab,
  agent,
}) => {
  const token = engineToken(engine)
  const holding = await tab(`token=${token}&holdMs=600000`)
  const panel = await tab(`token=${token}&holdMs=1`)

  await expect(panel.text('Drive this page with your agent.')).toBeVisible()
  await expect(panel.text(WAITING)).toBeVisible()
  await expect(panel.text(`npx @conciv/try --token ${token}`)).toBeVisible()
  await expect(holding.text(WAITING)).toBeVisible()

  await agent.connect()

  await expect(holding.text('Agent connected', {exact: true})).toBeVisible()
  await expect(holding.text('Drive this page with your agent.')).toBeVisible()
  await expect(holding.composer).toHaveCount(0)
  await expect(panel.composer).toBeVisible()
  await expect(panel.text(HANDED_OFF)).toBeVisible()
  await expect(panel.text('Drive this page with your agent.')).toBeHidden()

  await panel.reload()
  await expect(panel.composer).toBeVisible()
})
```

Kept: all 13 asserts. Gone: `held`, the null check, try/finally, manual page closes, per-assert `{timeout: 10_000/20_000}`
(one `expect.configure`/config timeout instead). `holdMs=600000` stays: it is a product option the page takes, already shortened
for the second tab.

---

## Open points for the maintainer

1. Playwright Test's `page` is a new BrowserContext per test, which reads against the "newPage(), not newContext()" law
   (that law was written for vitest widget ITs). Ruling: keep Playwright's built-in context per test in embed/mascot/e2e, or move
   those suites onto vitest + `@conciv/browser-fixture` (one runner, `newPage()` only)?
2. New product options for timers (#2 in d): `queryRetryDelayMs`, reconnect backoff/ceiling, handshake window.
3. Engine scope: test-scoped + `engineOptions` override (isolation, ~0.2 s per journey) vs file-scoped default engine.
