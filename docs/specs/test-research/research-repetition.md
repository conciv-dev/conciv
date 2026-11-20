# Test setup repetition inventory (main @ 476a97995, 2026-11-19)

Scope: 157 tracked `*.test.ts(x)` / `*.spec.ts` (102,821 lines), incl. 16 machine tests in `apps/conciv/src`, 39 in `packages/plugin-host/test`, 18 in `e2e/`, 6 fixture specs. Plus 41 non-test helper files under `*/test/` (6,735 lines). Counts are grep counts (files / occurrences); file:line cites the definition or a representative use.

Existing shared layers (what the rewrite should build on, not re-invent):

| layer                                                        | file                                                                       | consumers                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------- |
| `tempDir(prefix)` + per-file afterAll rm                     | `packages/vitest-config/src/temp-dir.ts:11`                                | 41 files, 350 calls             |
| `until()` poll                                               | `packages/harness-testkit/src/until.ts:17`                                 | 7 test files, 43 calls          |
| `createTestkit` / `createFakeHarness` / `scriptedRun`        | `packages/harness-testkit/src/create-testkit.ts`, `create-fake-harness.ts` | 5 / 5 / 7 files                 |
| `bootCoreKit` (engine + fake harness + home)                 | `packages/plugin-testkit/src/core-kit.ts:42`                               | 13 files                        |
| `openPluginWidget`, `widgetComponentSuite`, `serveStaticDir` | `packages/plugin-testkit/src/widget-suite.ts:106,135,39`                   | 9 files                         |
| `test` with file-scoped Chromium                             | `packages/browser-fixture/src/browser-fixture.ts:7`                        | 8 files                         |
| `magicLink` login                                            | `packages/harness-testkit/src/login.ts:54`                                 | 8 files                         |
| `storyConnection` / chunk builders                           | `packages/ai/src/testkit.ts`                                               | 5 files                         |
| solid `cleanup` afterEach                                    | `packages/vitest-config/src/solid-cleanup-setup.ts`                        | all vitest-browser Solid suites |
| e2e `loginWidget` / `expectWidgetBoots` / `collectFailures`  | `e2e/e2e-utils/src/widget.ts:36,69,107`                                    | 15 e2e specs (most are 8 lines) |

Per-package fixture files that overlap each other: `apps/conciv/test/helpers.browser.tsx` (934), `apps/conciv/test/commands/core-control.ts` (883), `apps/conciv/test/helpers.node.ts` (171), `packages/embed/test/helpers.ts` (456), `packages/core/test/helpers.ts` (294), `packages/cli/test/helpers.ts` (343), `packages/client/test/helpers.ts` (35), `packages/unplugin/test/helpers/dev-servers.ts` (165), `apps/site/test/helpers.ts` (124), `packages/ui-kit-chat/test/helpers.tsx` (94), `packages/ui-kit-chat-tools/test/helpers.tsx` (143).

## 1. Mounting the widget / app (6 ways)

| way                                                                           | files                                                              | occurrences                                                                                                                                                                          | where                                                                                                                                                                                                                                                                                                                                                                           | verdict                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A. vitest-browser + `render()` from `@solidjs/testing-library` (component)    | 17 vitest-browser files; `render(` in 19 files, 128 calls          | conciv.browser 33, builtin-plugins 25, ui-kit-system 15, streamdown 10                                                                                                               | `mountView = render(view).container` defined twice, identical: `packages/ui-kit-chat/test/helpers.tsx:41`, `packages/ui-kit-chat-tools/test/helpers.tsx:7`                                                                                                                                                                                                                      | fixture `mountComponent` (ui-kit level), one copy                           |
| B. vitest-browser pane/shell mount over a node-side core via browser commands | 1 file (conciv.browser) + calm-perf                                | `mountPane(` 35, `createShellHarness(` 38 (`const harness = createShellHarness(core)` + `afterEach(harness.dispose)` 30x), `coreControl` 542 refs, `createSession(coreRpc(...))` 106 | `apps/conciv/test/helpers.browser.tsx:307,471`; core booted by `apps/conciv/test/commands/core-control.ts:834` (wraps `bootCoreKit`)                                                                                                                                                                                                                                            | fixture `paneTest` (test.extend: core, session, mounted pane, auto-dispose) |
| C. prebuilt embed bundle served by node + Playwright page + magic link        | embed.it, plugin-testkit, 5 plugin browser/it files, 3 `widget.it` | embed.it: `bootEmbedKit(` 19, `serveWidgetHost(` 21, `openLoggedIn(` 30, `let kit` 16 describe-level lifecycles; `openPluginWidget(` 4x in test-runner.browser                       | two host-page builders: `packages/embed/test/helpers.ts:118` `hostPage`, `packages/plugin-testkit/src/widget-suite.ts:67` `hostPage`, third inline `packages/plugins/tanstack/test/tanstack.browser.test.ts:82`; two static servers: `embed/test/helpers.ts:74` `serveWidgetHost`, `widget-suite.ts:43` `serveFiles` (+ `unplugin/test/plugin.it.test.ts:361` `serveDirectory`) | fixture `widgetTest` (one host page, one static server, kit + page + login) |
| D. real dev servers (vite/next/…) + raw `chromium.launch`                     | unplugin.it                                                        | `chromium.launch` 4 (`plugin.it.test.ts:402,936,1002,1525`), `newPage` 28, `goto` 30                                                                                                 | `packages/unplugin/test/helpers/dev-servers.ts:34,74`                                                                                                                                                                                                                                                                                                                           | local; swap raw launch for `@conciv/browser-fixture`                        |
| E. Playwright runner on real host apps                                        | 15 e2e `widget.spec.ts` (10 are 8 lines)                           | -                                                                                                                                                                                    | `e2e/e2e-utils/src/widget.ts`                                                                                                                                                                                                                                                                                                                                                   | already shared; keep                                                        |
| F. site prerender + Playwright                                                | site.it                                                            | `newPage` 13, `goto` 12                                                                                                                                                              | `apps/site/test/helpers.ts:95,112`                                                                                                                                                                                                                                                                                                                                              | local                                                                       |

Shadow DOM: only 3 files touch `shadowRoot` (5 occ: solid-mascot.browser 2, embed.it 2, site.it 1). Everything else goes through role locators. Nothing to factor.

## 2. Fake harness / fake engine / fake CLI

| helper                                                          | defined                                  | files / calls                                                                   | hand-rolled alternatives                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createFakeHarness`                                             | harness-testkit `create-fake-harness.ts` | 5 files / 58 (core-api.it 39)                                                   | `cliHarness`+`fakeCli` `packages/core/test/core.test.ts:852,858` (defineHarness + makeTextAdapter by hand); `chatConfig` literals in 4 files (harness 16, core.test 9, core-api.it 4, chat 3)                                                                |
| `createTestHarness`                                             | harness-testkit                          | 4 / 18                                                                          | -                                                                                                                                                                                                                                                            |
| `scriptedRun` / scripts                                         | harness-testkit                          | 7 / 99 (harness-testkit 82)                                                     | -                                                                                                                                                                                                                                                            |
| `requireClaude` (real CLI)                                      | `packages/core/test/helpers.ts:32`       | 5 / 36                                                                          | -                                                                                                                                                                                                                                                            |
| `storyConnection` + chunk builders (client side fake stream)    | `@conciv/ai/testkit`                     | 5 / 49 (thread.browser 26)                                                      | -                                                                                                                                                                                                                                                            |
| fake CLI binaries on PATH (`#!/bin/sh` + PATH mutate + restore) | none shared                              | 4 files: cli 3, core-api.it 4, harness 3, ai 1; PATH writes 18 (core-api.it 10) | `fakeClaude` `cli.test.ts:2186` and `core-api.it.test.ts:873`; `fakeCodex` `core-api.it.test.ts:771`; `fakeOpencode` `harness.test.ts:1609`; saved-env objects `core-api.it.test.ts:579,614,768,5369,5434,5639`, `core.test.ts:1026`, `harness.test.ts:1600` |
| other fakes (stay local, single owner)                          | -                                        | -                                                                               | `fakeSimctl` ios:317, `fakeSpawner` test-runner:531, `fakeHot` builtin-plugins:946, `fakeTty`/`fakeTerminal` cli:3572,3741, `fakeEngine` harness-testkit:215                                                                                                 |

Recommendation: fake harness stays `createFakeHarness` (already one). Fake-binary-on-PATH (writes script, prepends PATH, restores env) is 7+ copies across 3 packages -> one helper `fakeBinary(name, script)` in harness-testkit that returns `{bin, calls()}` and restores PATH via `onTestFinished`. `cliHarness`/`fakeCli` in core.test stays local (one file).

## 3. Engine / server start-stop, ports, temp dirs, CONCIV_HOME, db

### 3a. The same "makeApp -> BootApp -> createTestkit" adapter is written 4 times

| copy                                                                                | file:line                                           | callers                                                                                                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `bootMadeApp` / `bootCoreApp` / `bootKit` (+ module-level `running` Set + afterAll) | `packages/core/test/helpers.ts:158,170,210,166-168` | core-api.it (`bootKit` 25, `bootMadeApp` 9), core-chat.it, core.test (`bootMadeApp` 13; raw `makeApp(` 7 more)            |
| `bootCliApp` / `bootCli` (also sets `process.env.CONCIV_PORT/TOKEN/SESSION_ID`)     | `packages/cli/test/helpers.ts:~20-49,51`            | cli 23, client 20                                                                                                         |
| `bootClientKit`                                                                     | `packages/client/test/helpers.ts:8`                 | client 20                                                                                                                 |
| `bootCoreKit` (fake harness, editor capture, files, home)                           | `packages/plugin-testkit/src/core-kit.ts:42`        | 13 files; wrapped again by `bootEmbedKit` `packages/embed/test/helpers.ts:34` and by `core-control.ts` for conciv.browser |

Then each plugin node test wraps `bootCoreKit` once more with the same 4 lines (`bootCoreKit({id:'fake', plugins:[PACKAGE_DIR, options?], files}); onTestFinished(kit.cleanup)`):
`ios.test.ts:69 boot`, `whiteboard.test.ts:115 boot`, `tanstack.test.ts:59 bootProject`, `test-runner.test.ts:76 bootProject`, `recorder.test.ts:~118`.

Verdict: ONE fixture `engine` (test.extend, test-scoped, auto-cleanup) on top of `bootCoreKit`, with options `{plugins, files, harness, stateRoot, home, env}`. core/cli/client/embed/plugin boots become option sets of it. Keep `createTestkit` as the low layer.

### 3b. Ports / static servers / proxies

| helper                                                   | copies                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listenLocal(server)` on 127.0.0.1:0                     | `packages/plugin-testkit/src/listen-local.ts:3` (shared, used by embed), `apps/conciv/test/helpers.node.ts:5` (private copy), `apps/conciv/test/commands/core-control.ts:194 listenOnConnectPort`, `packages/plugins/try-it/test/try-it.browser.test.ts:34 onConnectPort` |
| `proxyTo` / `ProxyCore` (http+ws proxy with fault knobs) | `packages/embed/test/helpers.ts:146,163` and `apps/conciv/test/helpers.node.ts:24,45`: same `handshakeResponse` + upgrade piping, different knobs (traffic count/drop vs awaitRequest/fail/repair)                                                                        |
| `reserveDeadPort`                                        | `packages/embed/test/helpers.ts:139` (1 owner)                                                                                                                                                                                                                            |
| port 0 / getPort style                                   | 9 files, 42 occ (unplugin.it 25)                                                                                                                                                                                                                                          |

Verdict: one `proxyTo` in plugin-testkit with the union of knobs; one `listenLocal`.

### 3c. Temp dirs, home, env

| pattern                      | files / occ                                                        | note                                                                                            |
| ---------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `tempDir()` (shared)         | 41 / 350                                                           | already the one way                                                                             |
| raw `tmpdir()`               | 15 / 47 (plugin-host npm 11, skill 6, core-api.it 6, npm-config 5) | plugin-host files are opencode copies using `fixture/tmpdir.ts:9,19` (`tmpdir`, `tmpdirScoped`) |
| raw `mkdtemp`                | 6 / 14                                                             | ai, plugin-host x4, e2e packed-closure                                                          |
| `rm(..., recursive)` by hand | 27 / 82 (core-api.it 17, publish 11, core.test 8)                  | mostly redundant with `tempDir`'s own cleanup                                                   |
| `CONCIV_HOME`                | 6 / 33 (cli 16, core-api.it 8, db 4)                               |                                                                                                 |
| `process.env.X =` mutation   | 9 / 53 (core-api.it 20, cli 11, unplugin 8, harness 4)             | save/restore by hand each time                                                                  |

Verdict: env mutation + restore -> fixture option `env` on `engine` (or `withEnv` helper using `onTestFinished`); `tempDir` stays; plugin-host `tmpdirScoped` stays local (Effect scope, opencode copy).

### 3d. DB open/close

Same body (`Scope.makeUnsafe` + `openDb(root)` + `onTestFinished(Scope.close)`) in 4 files: `packages/chat/test/chat.test.ts:66 openDatabase`, `packages/core/test/core.test.ts:276 openDatabase`, `packages/db/test/db.test.ts:49 opened`, `packages/ai/test/ai.test.ts:~50`. Plugin-host does the Effect form `tmpdirScoped()+openDb(tmp.path)` in 7 files (`bus.test.ts:21`, `bus-session-routing.test.ts:21`, `bus-unpersisted.test.ts:13`, `kv.test.ts:17`, `rpc-handler-errors.test.ts:17`, `database.test.ts:47`, `fixture/permission.ts:30`).
Verdict: export one `openTestDb()` from `@conciv/db` test entry (or vitest-config); the plugin-host Effect form stays one local layer in the merged plugin-host file.

## 4. Browser launch / page creation

| way                                              | files                                                                                                     | occ                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| vitest browser mode (`from 'vitest/browser'`)    | 17                                                                                                        | `expect.element` 3,228 calls in 15 files  |
| `@conciv/browser-fixture` (file-scoped Chromium) | 8 (site helpers, embed unit, plugin-testkit, recorder.it, tanstack/test-runner/try-it/whiteboard browser) | `browser.newPage` 60 calls in 7 files     |
| `@playwright/test` runner                        | embed.it, mascot.it, 15 e2e specs                                                                         | -                                         |
| raw `chromium.launch`                            | unplugin.it only                                                                                          | 4 (`plugin.it.test.ts:402,936,1002,1525`) |
| `newContext`                                     | site.it only                                                                                              | 1 (AGENTS.md says newPage)                |

Verdict: Chromium comes only from `@conciv/browser-fixture` (vitest+playwright) or the Playwright runner; unplugin.it moves onto browser-fixture. `newPage` + `goto(magicLink(...))` + `close` lives inside `widgetTest` (see 1C).

## 5. Waits

| wait                         | files / occ                                                                                                                                                                                                                                           | top                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `expect.poll`                | 9 / 42                                                                                                                                                                                                                                                | conciv.browser 22, embed.it 5                                |
| `vi.waitFor`                 | 11 / 46                                                                                                                                                                                                                                               | core-api.it 18, core.test 7                                  |
| any `waitFor*`               | 29 / 170                                                                                                                                                                                                                                              | unplugin.it 37, core-api.it 34, harness-testkit 18           |
| `page.waitFor*`              | 8 / 15                                                                                                                                                                                                                                                | unplugin.it 5, embed.it 3                                    |
| `until()` (harness-testkit)  | 7 / 43                                                                                                                                                                                                                                                | core-api.it 17, embed.it 14                                  |
| custom poll wrappers         | `untilPanelDraft` `embed/test/helpers.ts:328` (until + console capture), `untilExists` `ai.test.ts:996`, `waitForEngine` `e2e/nextjs/test/widget.spec.ts:91`, `untilRecordingGoesLive` `recorder.it.test.ts:101`, `setInterval` poll `ai.test.ts:253` |                                                              |
| explicit `timeout:` literals | 28 files / 936 (conciv.browser 446, embed.it 154, recorder.it 52)                                                                                                                                                                                     | values: 15_000 x230, 8000 x213, 30_000 x197, 10_000 x80      |
| `test.setTimeout`            | embed.it 50                                                                                                                                                                                                                                           |                                                              |
| `vi.useFakeTimers`           | 6 / 18                                                                                                                                                                                                                                                | conciv.browser, core-api.it, plugin, recorder x2, whiteboard |

Fixed sleeps (timing guesses):

| kind                                        | count               | where                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inline `new Promise(r => setTimeout(r, N))` | 11 in 8 files       | harness-testkit 575,831,851,914,930 (50/30/20 ms); it/dev-endpoint-option 34 (300 ms); markdown.browser 300 (16 ms); streamdown.browser 415,434 (0 ms); unplugin.it 101 (20 ms); client 155 (5 s race)        |
| `wait/sleep(N)` via helper                  | 28 calls in 6 files | mascot.it 12 (`harness.wait(1200/900/60)` 1781-1920), brand + brand-react lockup 4+4, builtin-plugins 4 (`wait(500)` 978-1008), core.test 3                                                                   |
| sleep helper definitions                    | 5                   | `brand/test/browser/lockup-dom.ts:17`, `brand-react/test/browser/lockup-dom.ts:17` (identical files), `mascot/test/e2e/helpers.ts:229`, plugin-host `fixture/flock-worker.ts:19`, `effect-flock-worker.ts:19` |
| `page.waitForTimeout`                       | 1                   | `e2e/nextjs/test/packed-install.spec.ts`                                                                                                                                                                      |

Verdict: one wait primitive per runtime: `expect.poll`/`expect.element` (vitest browser), Playwright `expect(locator)` (runner), `until` (node). Default timeouts set ONCE in config (vitest `expect.poll.timeout`, Playwright `expect.timeout`) instead of 936 literals. Sleeps go (audit already lists them: `test-audit-unplugin-it.md:138`, `test-audit-summary-2.md:21,36,50,108`).

## 6. Same-named / same-bodied helpers across files

254 helper names are defined in 2+ files; most are generic (`call`, `run`, `mount`) with different bodies. The real duplicates (same body or same job):

| helper                                                                    | files (file:line)                                                                                                                                                                                                                | same body?                        | home                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| `mountView`                                                               | ui-kit-chat `test/helpers.tsx:41`, ui-kit-chat-tools `test/helpers.tsx:7`                                                                                                                                                        | identical                         | `mountComponent` fixture                              |
| `useTool(kit, name, input)` = `kit.callTool(prefix_name)`                 | recorder.test 148, tanstack.test 65, test-runner.test 103, whiteboard.test 186                                                                                                                                                   | same shape, plugin prefix differs | `pluginTest` fixture: `plugin.tool(name, input)`      |
| `call(kit, method, input)` = `kit.rpc.plugin.call({rpcId, ...}, timeout)` | recorder.test 219, test-runner.test 91, whiteboard.test 128                                                                                                                                                                      | same shape                        | `pluginTest`: `plugin.call(method, input)`            |
| `rejection` / `toolFailure` / `failureType` / `unavailableError`          | recorder 152,165,223; whiteboard 132,136; tanstack.test 84; tanstack.browser 53; test-runner 96                                                                                                                                  | same body                         | `pluginTest`: `expectToolFailure`, `expectRpcFailure` |
| `boot` / `bootProject` (bootCoreKit + PACKAGE_DIR + onTestFinished)       | ios 69, whiteboard 115, tanstack.test 59, test-runner.test 76                                                                                                                                                                    | same body                         | `pluginTest`                                          |
| `directToolNames` (MCP client tools list)                                 | ios 105, test-runner.test 119                                                                                                                                                                                                    | identical                         | `pluginTest`                                          |
| `fixtureFiles`                                                            | tanstack.test 33, test-runner.browser 44, test-runner.test 67                                                                                                                                                                    | per plugin                        | local                                                 |
| `hostFolder`                                                              | tanstack.browser 62, try-it.browser 79                                                                                                                                                                                           | similar (write host html)         | `widgetTest` host page                                |
| `openChat` / `openChatPanel` / `openPanel`                                | whiteboard.browser 161, embed helpers 317 and 424 (two in one file), conciv.browser 2955, unplugin.it 1023; inline click on 'Open conciv chat' in recorder.it 73,144, test-runner.browser 69,170,270,375, site.it 185,345        | same job                          | `widgetTest`: `widget.open()`                         |
| `sendMessage` / `sendChatMessage` / `sendTurn`                            | embed helpers 323,452; conciv helpers.browser 180; client.test 1008; embed.it 880                                                                                                                                                | same job, 3 bodies                | `widgetTest`: `widget.send(text)`                     |
| `runTurn`                                                                 | conciv helpers.browser 169, core helpers 137, client.test 191                                                                                                                                                                    | different layers                  | per level                                             |
| `createSession` / `seedDraft`                                             | conciv `helpers.browser.tsx:125,130` and `helpers.node.ts:156,161`                                                                                                                                                               | identical                         | one conciv helper                                     |
| `proxyTo` / `ProxyCore`                                                   | embed helpers 146,163; conciv helpers.node 24,45                                                                                                                                                                                 | forked                            | plugin-testkit                                        |
| `listenLocal`                                                             | plugin-testkit `listen-local.ts:3`; conciv `helpers.node.ts:5`                                                                                                                                                                   | forked                            | plugin-testkit                                        |
| `hostPage`                                                                | embed helpers 118; widget-suite 67; tanstack.browser 82 inline                                                                                                                                                                   | same html                         | `widgetTest`                                          |
| `openDatabase` / `opened`                                                 | chat 66, core.test 276, db 49, ai ~50                                                                                                                                                                                            | identical                         | `openTestDb`                                          |
| `nextEvent`                                                               | core.test 256, core-api.it 180 (+ client.test 653)                                                                                                                                                                               | identical generic                 | `engine` fixture or until-based                       |
| `userTexts`                                                               | core helpers 133, core.test 3514, client.test 584                                                                                                                                                                                | same                              | core helpers only                                     |
| `askRaised`, `engineWithTab`                                              | cli.test 1129,1068; core-api.it 4947,5826                                                                                                                                                                                        | same job                          | `engine` fixture                                      |
| `openSessionPanel`, `seedExchanges`                                       | embed.it 700,2942; conciv.browser 6605,3247                                                                                                                                                                                      | same job, different level         | per level                                             |
| `mascot-dom.ts` (`isDigit`, `isEmitter`, ...)                             | `packages/mascot/test/browser/mascot-dom.ts`, `packages/mascot-react/test/browser/mascot-dom.ts` (50 lines each), `mascot/test/e2e/helpers.ts:160,162`                                                                           | identical                         | one mascot test export                                |
| `lockup-dom.ts` (`wait`, mount)                                           | `packages/brand/test/browser/lockup-dom.ts`, `packages/brand-react/test/browser/lockup-dom.ts`; `mountLinkedLockup` brand 7, brand-react 14                                                                                      | identical                         | one brand test export                                 |
| `replay(events)` reducer over a machine                                   | 7 apps/conciv/src machine tests (`persist-machine.test.ts:28`, `dialog-machine.test.ts:10`, `host-machine.test.ts:15`, `instance-machine.test.ts:34`, `machine.test.ts:29`, `session-store-machine.test.ts:11`) + try-it.test 43 | same shape                        | local to the merged conciv node file                  |
| `harness()`+`dispatch` (machine runner)                                   | attach-machine 13, composer-write-machine 6, link-check-machine 9, located-machine 13                                                                                                                                            | same shape                        | local to the merged conciv node file                  |
| `get`, `greeter`, `write`, `exists`, `lock`, `readJson`                   | plugin-host test files                                                                                                                                                                                                           | opencode copies                   | local (merged plugin-host file)                       |

Within-file repetition (locator factories re-declared per describe):

- conciv.browser: `editor`/`input`/`composer` = textbox 'Message the conciv agent' 32 declarations (`3879, 4323, 4732, 4796, 4892, 5782, 6086, 6154, 6181, 6600, 6654, 7235, 9060, 11037`...), `launcher` 6, `stopButton` 6, `readLocalCopy` 10 (`648, 674, 699, 956, 5649, 6282, 6323, 6420, 6443, 6467`), `picker` 5, `pickButton` 5.
- Across files, the composer textbox name string appears 106x in 13 files; 'Open conciv chat' 50x in 9; 'conciv chat agent' dialog 55x in 11; 'Send message' 46x in 6; 'Stop generating' 27x in 6.
  Verdict: one `widget` page-object in the fixture (`composer`, `send`, `stop`, `launcher`, `panel`, `log`), shared by vitest-browser and Playwright via role names only.

## 7. Cleanup patterns

| hook             | files / occ | top                                                                                       |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `onTestFinished` | 23 / 253    | core.test 48, conciv.browser 48, builtin-plugins 47, core-api.it 45                       |
| `afterEach`      | 19 / 114    | conciv.browser 51 (30 are `afterEach(harness.dispose)`), embed.it 9, unplugin 7, client 7 |
| `afterAll`       | 21 / 57     | embed.it 13, core-api.it 10                                                               |
| `beforeAll`      | 15 / 54     | embed.it 13, harness 8, core-api.it 7                                                     |
| `beforeEach`     | 9 / 34      | mascot.it 12, embed.it 8                                                                  |

What gets cleaned (onTestFinished bodies): `kit.cleanup` 13+, `engine.stop` 8, `mcp.close` 8, `host.remove` 8, `driver.dispose` 8, `host.dispose` 7, `made.dispose` 6, `unmount` 7+, `Scope.close` 3, `browser.close` 3. afterEach bodies: `harness.dispose()` 7 + 30 bare, `kit?.cleanup()` 6, `host.close()` 4, `document.body.innerHTML = ''` 3, `vi.restoreAllMocks()` 3, `vi.unstubAllEnvs()` 2, `cleanups.splice(0)` loops 2, `scratch.splice(0)` rmSync loops 2. Module-level registries that auto-dispose: `packages/core/test/helpers.ts:164-168` (`running` Set + afterAll).
embed.it: ~25 describes each own their kit/host lifecycle (~350 lines; `test-audit-embed-it.md:100-101`).

Verdict: every engine/host/page/mount/db cleanup moves inside the fixture teardown (vitest `test.extend` / Playwright fixtures). Tests keep `onTestFinished` only for one-off resources they create themselves.

## 8. Recommendation summary

| fixture (name)                                                                                                      | hides                                                                                           | replaces                                                                                                                                                           | est. files touched |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `engine` (node, test.extend over `bootCoreKit`; options plugins/files/harness/env/home/stateRoot)                   | makeApp adapter, fake harness, temp home, env save/restore, PATH fake bins, cleanup             | `bootKit`/`bootMadeApp`/`bootCoreApp` (core), `bootCli` (cli), `bootClientKit` (client), `bootEmbedKit` (embed), plugin `boot`/`bootProject` x5, raw `makeApp` x10 | ~15                |
| `pluginTest` (= `engine` with `plugins:[PACKAGE_DIR]`)                                                              | `tool()`, `call()`, failure readers, `directToolNames`                                          | 4-5 plugin node files' local helpers                                                                                                                               | 5                  |
| `widgetTest` (browser-fixture + engine + one host page + one static server + magic-link page; `widget` page object) | `hostPage` x3, static servers x3, `openLoggedIn`, `openPanel*`, `sendMessage*`, switch session  | embed helpers, widget-suite `openPluginWidget`, plugin browser files, unplugin raw launch                                                                          | ~12                |
| `paneTest` (vitest-browser; core via browser commands, session, pane mount, auto-dispose)                           | `createShellHarness`+`afterEach(dispose)` x30, `createSession(coreRpc())` x106, `mountPane` x35 | conciv.browser + calm-perf                                                                                                                                         | 2                  |
| `mountComponent` (vitest-browser; optional `ChatProvider`/`createChat(storyConnection)` wrap)                       | `render().container`, provider wrapping (`<ChatProvider` 32 in 3 files, `createChat(` 28)       | ui-kit-chat x4, ui-kit-chat-tools, conciv component describes                                                                                                      | ~6                 |
| `openTestDb`                                                                                                        | scoped openDb + close                                                                           | 4 copies                                                                                                                                                           | 4                  |
| config defaults (not a fixture)                                                                                     | `expect.poll`/`expect.element`/Playwright expect timeouts                                       | 936 `timeout:` literals, 50 `test.setTimeout`                                                                                                                      | 28                 |

Stays local: plugin-specific fakes (`fakeSimctl`, `fakeSpawner`, `fakeHot`), machine `replay`/`harness`, plugin-host opencode fixtures (`tmpdirScoped`, `get`, `greeter`), site/unplugin dev servers, mascot/brand DOM readers (but de-duplicate the two pairs), e2e (already on e2e-utils).

Audit cross-refs that already name this repetition: `test-audit-embed-it.md:100-101` (per-describe boot boilerplate ~350 lines), `test-audit-conciv-browser.md:382` (journeys remove repeated mount/setup + locator boilerplate, 30-40%), `test-audit-core-api-it.md:342` (~700 lines of helpers/fixtures to move to a plugin fixture and the testkit), `test-audit-summary-2.md:18` (big-five delta "mostly fixture churn"), `test-audit-unplugin-it.md:138` (hand-rolled waitFor, sleep(600/200)), `test-audit-summary-2.md:21,36,50,108` (sleeps), `test-rewrite-after-port.md` rule 3-4 (journeys/tables) but it names no fixture layer: the plan is silent on shared fixtures.

---

## 9. Example A: component-level browser test (to rewrite on `mountComponent`)

Why: small, uses the full provider stack by hand (`createChat` + `storyConnection` + `ChatProvider` + `Thread`) that 3 files repeat 28-32 times; `mountView` is one of the two identical copies.

`packages/ui-kit-chat/test/helpers.tsx:41-43`

```tsx
export function mountView(view: () => JSX.Element): HTMLElement {
  return render(view).container
}
```

`packages/ui-kit-chat/test/composer.browser.test.tsx:420-474`

```tsx
describe('attachment only user message', () => {
  const GIF_BASE64 = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

  function ThreadHost(props: {content: () => SendContent}): JSX.Element {
    const chat = createChat({
      threadId: 'attachment-only-user-message',
      connection: storyConnection({chunks: [], chunkDelay: 2}),
    })
    return (
      <ChatProvider chat={chat}>
        <button type="button" onClick={() => void chat.sendMessage(props.content())}>
          send
        </button>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    )
  }

  it('a sent image shows in the user turn', async () => {
    const sentImage = (): SendContent => ({
      content: [
        {type: 'text', content: 'what color is this'},
        {type: 'image', source: {type: 'data', value: GIF_BASE64, mimeType: 'image/gif'}},
      ],
    })
    mountView(() => <ThreadHost content={sentImage} />)

    await page.getByRole('button', {name: 'send'}).click()

    await expect.element(page.getByText('what color is this'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'image-1'})).toBeVisible()
  })

  it('an image sent as a data URL is named image, never by its data', async () => {
    const sentDataUrl = (): SendContent => ({
      content: [
        {type: 'text', content: 'what is in this'},
        {type: 'image', source: {type: 'url', value: `data:image/gif;base64,${GIF_BASE64}`}},
      ],
    })
    mountView(() => <ThreadHost content={sentDataUrl} />)

    await page.getByRole('button', {name: 'send'}).click()

    await expect.element(page.getByText('what is in this'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Open image', exact: true})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'image', exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: /base64/})).not.toBeInTheDocument()
  })
})
```

Rewrite target: one journey test (both sends in one thread), `mountComponent` supplies the chat + `ChatProvider` + thread, a `send` driven through the real composer or the chat handle, no inline `timeout: 2000`.

## 10. Example B: flow test (to rewrite on `widgetTest`)

Why: real bundle + real engine + login + session pick + reload; uses 5 helpers (`setupWidgetSuite`, `openPanelOnNewSession`, `untilPanelDraft`, `chatBox`, `chatLog`) whose jobs are re-written in conciv.browser, whiteboard.browser, recorder.it, test-runner.browser; inline `timeout: 30_000` x8 and `test.setTimeout(240_000)` x2.

`packages/embed/test/e2e/embed.it.test.ts:582-656`

```ts
test.describe('draft send remount', () => {
  const ASSISTANT_TEXT = 'Reply to the message sent before the reload'
  const USER_TEXT = 'a message sent right before the reload'

  const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

  test.describe('a sent message never comes back as a draft', () => {
    test('leaves the composer empty when the panel reloads after the send', async ({page}) => {
      test.setTimeout(240_000)
      const sessionId = await openPanelOnNewSession(page, suite)

      const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await input.fill(USER_TEXT)
      await untilPanelDraft(page, suite.kit(), sessionId, (draft) => draft.text === USER_TEXT)

      await page.getByRole('button', {name: 'Send message'}).click()
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
      await page.reload({waitUntil: 'domcontentloaded'})

      await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText('', {timeout: 30_000})
      await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
      expect((await suite.kit().rpc.drafts.get({sessionId}))?.text ?? '').toBe('')
    })

    test('a follow-up typed after a queued send is the draft once the queued run starts, also after a reload', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      const RUNNING_TEXT = 'a run that keeps going'
      const QUEUED_TEXT = 'sent while the run goes'
      const FOLLOW_UP_TEXT = 'typed after the queued send'
      const kit = suite.kit()
      const sessionId = await openPanelOnNewSession(page, suite)
      const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
      const composer = chatBox(page)
      const stop = panel.getByRole('button', {name: 'Stop generating'})
      const queued = panel.getByRole('listitem').filter({hasText: QUEUED_TEXT})
      kit.harness.script.hold()
      try {
        await composer.click()
        await composer.pressSequentially(RUNNING_TEXT)
        await page.keyboard.press('Enter')
        await expect(stop).toBeVisible()
        await expect(chatLog(page).getByText(ASSISTANT_TEXT)).toHaveCount(1)
        await composer.click()
        await composer.pressSequentially(QUEUED_TEXT)
        await page.keyboard.press('Enter')
        await expect(queued).toBeVisible()
        await expect(composer).toHaveText('')

        await composer.click()
        await composer.pressSequentially(FOLLOW_UP_TEXT)
        await untilPanelDraft(page, kit, sessionId, (draft) => draft.text === FOLLOW_UP_TEXT)

        kit.harness.script.release()
        await expect(queued).toBeHidden()
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(1)
        await expect(chatLog(page).getByText(ASSISTANT_TEXT)).toHaveCount(2)
        await expect(stop).toBeHidden()
        expect(await kit.rpc.drafts.get({sessionId})).toMatchObject({text: FOLLOW_UP_TEXT})

        await page.reload({waitUntil: 'domcontentloaded'})
        await expect(panel).toBeVisible()
        await expect(chatLog(page).getByText(QUEUED_TEXT)).toHaveCount(1)
        await expect(composer).toHaveText(FOLLOW_UP_TEXT)
      } finally {
        kit.harness.script.release()
      }
    })
  })
})
```

Helpers it hides today (`packages/embed/test/helpers.ts`):

`:240-261`

```ts
export function setupWidgetSuite(options: Parameters<typeof bootEmbedKit>[0] = {}): WidgetSuite {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit(options)
    host = await serveWidgetHost((url) =>
      hostPage({apiBase: url.searchParams.get('apiBase') ?? kit.base, widget: '{"quickTerminal":false}'}),
    )
  })

  test.afterEach(async () => {
    kit.harness.script.release()
    await host.close()
    await kit.cleanup()
  })

  return {kit: () => kit, host: () => host}
}
```

`:442-450`

```ts
export async function openPanelOnNewSession(page: Page, suite: WidgetSuite): Promise<string> {
  const {sessionId} = await suite.kit().rpc.sessions.create()
  const title = `session under test ${sessionId.slice(-12)}`
  await suite.kit().rpc.sessions.rename({sessionId, title})
  await openLoggedIn(page, suite.kit(), suite.host().base)
  await openPanel(page)
  await switchToSessionByTitle(page, title)
  return sessionId
}
```

(`openLoggedIn` :113-116, `openPanel` :424-430, `switchToSessionByTitle` :432-440, `untilPanelDraft` :328-355 = `until` 30 s + console capture, `chatBox`/`chatLog` :292-298, `bootEmbedKit` :34-67 = `bootCoreKit` + cleanup error swallow.)

Rewrite target: one journey test; `widgetTest` gives `{engine, widget}` with `widget.openNewSession()`, `widget.composer`, `widget.send()`, `widget.log`, `engine.harness.hold()` auto-released in teardown, `engine.draft(sessionId)` polled by `expect.poll`; timeouts from config.
