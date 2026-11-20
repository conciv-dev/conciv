plugins-q: RESEARCH layers 3+4 done (no code). Full reports with file:line + tables: scratchpad/test-research-layers-3-4/browser.md and node.md (+ alltests.tsv, counts.tsv). Measured from the baseline CI shard logs (vitest 5.1.0, Playwright 1.64.1, storybook 10.6.5); I spot-checked claims against origin/main (corrections below).

HEADLINES

- CI wall 21m59s = shard-1 = conciv.browser.test.tsx alone (~1084-1111 s). 53-58% of that file is RED tests (26-29 fails, 573-621 s/run); 20 of 26 die at 15.3-17.2 s = per-call {timeout: 15_000}. Next shard 10m45s. Shards pack whole packages (vitest-config shards.ts:98-128), so conciv is never split.
- Engine boot is cheap (~0.2 s browser-side start/stop; node in-process ~0.1 s, full start() 0.3-0.9 s). The time goes to tests WAITING OUT HARD-CODED PRODUCT TIMERS: query retry backoff, reconnect windows/ceiling (conciv, embed 'forced drop' 52 s, client 10 s), whiteboard export/commit deadlines (canvas-tools.ts:22-23, 10 s/15 s; 33.5 s node + 37.7 s browser), core idle/heartbeat 5 s, ai 12 s silence, fixed `await wait(4000)` core.test.ts:2559, 300 ms sleep in packages/it afterEach.
- Node: no pool/isolate/provide-inject/test.extend anywhere; every file its own fork. plugin-host: 48% of time is imports (39 files each re-import Effect). oxlint-plugin: one oxlint process per test (~0.43 s each). cli: each conciv() spawns the built bin (57 + 24 call sites). core-api.it ~90 engine boots (19 via a hand-rolled sharedKit), core.test ~65. Hazard: core-api.it.test.ts:1583-1782 boots six engines with the OS temp dir itself as the project folder.
- Browser: 4 runner styles (vitest browser mode: app + ui-kits, engine via BrowserCommands core-control.ts; vitest-node + Playwright library via @conciv/browser-fixture: plugin suites; Playwright Test: embed.it, mascot.it, e2e/*; Storybook vitest addon). All browser projects fileParallelism:false; no retries. conciv.browser has 571 local helpers (`editor` defined 14x) and a hand-written `until` poller.

ESTIMATED SAVINGS (basis in the reports)

- conciv.browser green: ~10 min off CI wall (21m59s -> ~11-12 min).
- one default element timeout (~5 s) instead of 469 per-call 8 s/15 s: ~200 s per red run.
- product timers become settable options the test shortens: browser ~50-60 s conciv, ~40 s embed, ~25 s whiteboard; node whiteboard ~32 s, ai ~21 s, client ~12 s, core stall ~11 s, stop-grace ~9 s, existing page timeout options ~15 s, wait(4000) ~4 s.
- oxlint once per config, not per test: ~25-30 s. cli in-process rows: ~8-12 s.
- one engine per file: core ~10 s wall, four plugin suites ~15-30 s; browser shared engine <=15 s; journeys vs per-behaviour browser tests <=45 s.
- After conciv is green the next bottleneck is the ~10.7 min shard; e2e jobs are setup-dominated (223 s of tests in ~15 min of job time; `vite --force` suspected, unmeasured).
- ORDER WARNING: merging core's two big files (78 s + 71 s, parallel today) into one file per package adds ~70 s wall unless timer options + fixtures land first and independent describes use describe.concurrent; same for plugin-host (62.6 s summed vs 34-55 s wall).

FIXTURE LAYERS (vitest test.extend scoped fixtures / Playwright test.extend worker fixtures, per their docs)

- Browser: L0 browser (worker) -> L1 widget host/bundle (file) -> L2 engine, TEST-scoped with an `engineOptions` value overridden per describe (vitest test.override / Playwright test.use; vitest forbids overriding file/worker fixtures in a describe, and 30 of 52 conciv engine starts use their own config) -> L3 page (shell/pane/widgetPage/loggedInPage) -> L4 faults + wire observers with auto cleanup -> L5 user-level `widget`/`chat`/`login`/`approve`. `until` -> expect.poll / vi.waitFor.
- Node: one `nodeTest` builder: file scope = engine options (overridable per file/project), temp workspace, harness, one engine (onCleanup); test scope = fresh session, client, helpers (send turn, approve, call tool, call plugin method, read event feed); a per-test engine fixture for restart/multi-engine cases. Needs a per-test RESET on the scripted harness (none exists today).
- Every helper in today's files/testkits is mapped to its target fixture with file:line in the reports (conciv helpers + core-control commands, embed helpers, plugin-testkit, harness-testkit, mascot, core/cli/plugin-host/it/oxlint helpers).
- Rewrites shown in the reports (not committed): conciv 'launcher activity > a session whose row fails to load' (:3826-3867), try-it 'covers the panel with the connect steps' (try-it.browser.test.ts:118-156), and four core-api.it tests (:1866-2034) as one file engine + per-test session in two journeys.

CORRECTIONS (my checks): the browser report says "no newContext/networkidle/waitForTimeout": wrong in two places: apps/site/test/site.it.test.ts:326 `browser.newContext(devices['iPhone 13'])` (device emulation) and e2e/nextjs/test/packed-install.spec.ts:73 `page.waitForTimeout(2000)` (a sleep: should go). The per-call timeout count is 469 (256x 15_000 + 213x 8000), plus 9x 3000, 5x 10_000, 3x 2000; the report said 419.
FOUND ON THE WAY: try-it.browser.test.ts:185-202 has no finally, so a failure leaks browser pages.

RULINGS NEEDED

1. Playwright Test's built-in `page` makes a new context per test, against the newPage-not-newContext law: keep Playwright Test for embed.it/mascot.it/e2e, or move embed+mascot onto vitest + @conciv/browser-fixture? (my pick: move embed+mascot to vitest + browser-fixture, one runner for widget ITs; e2e consumer apps stay Playwright Test, they test packaging, not widget state)
2. New timer options are API extensions and need approval: query retry delay, reconnect backoff/ceiling, handshake window, whiteboard export/commit deadlines, ai silence timeout, core idle/heartbeat, stop-grace, client reconnect ceiling. (my pick: yes, all, each as an option the product already reads, defaults unchanged)
3. Engine fixture scope: test-scoped (isolation, ~0.1-0.2 s/journey) vs one file-scoped default engine. (my pick: browser = test-scoped; node = file-scoped default + per-test session, with a per-test engine fixture for restart cases)
