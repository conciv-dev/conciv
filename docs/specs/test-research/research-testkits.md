# Testkit / test-support inventory (main @ 476a97995, 2026-11-19)

Counts = files importing the specifier (git grep, excl. md/json/lockfile). "uses" lists are examples.

## 0. Package map

| package                                        | published                                    | real testkit?        | notes                                                                                     |
| ---------------------------------------------- | -------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| @conciv/harness-testkit                        | yes (guards.ts:79)                           | yes                  | engine-in-process + fake harness + rpc/mcp clients                                        |
| @conciv/plugin-testkit                         | yes (guards.ts:78)                           | yes                  | core kit on fake harness, widget browser suite, rpc wire fault/observe tools              |
| @conciv/browser-fixture                        | yes (guards.ts:80)                           | yes                  | one vitest fixture: file-scoped Chromium                                                  |
| @conciv/plugin-page-testkit                    | private, src-only, no build/test script      | yes                  | `pageTabs()` fake page-plugin tabs                                                        |
| @conciv/vitest-config                          | private, src-only                            | config + helpers     | reporters/ciTest, tempDir, pack/install, shards, solid cleanup                            |
| @conciv/e2e-utils (e2e/e2e-utils)              | private                                      | yes (Playwright e2e) | config, ports, widget boot/login asserts                                                  |
| @conciv/ai `./testkit`                         | yes (subpath of @conciv/ai, package.json:10) | yes                  | scripted chat connection + chunk builders                                                 |
| @conciv/it                                     | yes                                          | NO                   | not a test package: product "one install" re-export of unplugin (packages/it/README.md:3) |
| packages/extension-testkit, extension-compiler | deleted in #1124 (26d402137)                 | dead                 | only untracked `dist/`+`node_modules/` left on disk; safe to rm                           |

None of the live testkits import `@conciv/extension` (grep clean; .changeset/testkits-drop-extension-leftovers.md says `serveExtensionRpc` was removed from rpc-mounts). Extension leftovers remain only in vitest-config shards: `PACKAGE_GROUPS` includes `packages/extensions` (packages/vitest-config/src/shards.ts:18) and `PACKAGES_OUT_OF_CI = ['@conciv/extension-design']` (shards.ts:24); `packages/extensions/design` (120 tracked files) and `packages/extension` still exist.

## 1. @conciv/harness-testkit

Purpose: boot any app `fetch` behind a real loopback HTTP/WS server with a temp state root, plus fake/scripted harnesses and engine clients.
Boots: whatever `BootApp` returns (caller passes makeApp) -> `serveHono` on 127.0.0.1 (serve-app.ts:10-17); mkdtemp state root (create-testkit.ts:117); browser oRPC client over WS (create-testkit.ts:133). No browser, no child process (except tests of the kit itself), db = whatever makeApp opens in stateRoot.

Exports (`.` = src/testkit.ts):

- `createTestkit(harness, boot, {stateRoot})` -> `Kit` {base, wsBase, rpc, session, turn, join, hydrate, events, chat, post, get, invokeTool, callTool, restartServer, cleanup} (create-testkit.ts:35-58,113). 7 files: cli/test/helpers.ts:52, client/test/helpers.ts:10, core/test/helpers.ts:159, core-api.it:505, plugin-testkit core-kit.ts:81.
- `createFakeHarness(opts)` -> HarnessAdapter + `script: ScriptedRun` + transcript hold; history/resume/tty/models/commands fixtures (create-fake-harness.ts:18,127). 8 files: site.it.test.ts:9, try.test.ts:5, client/test/helpers.ts:9.
- `createTestHarness(real)` wraps a REAL harness with a script (create-test-harness.ts:10). Only core-api.it (503, 1503, 2081..).
- `ScriptedRun` types (scripted-run.ts:5-20; `makeScriptedRun` 190 internal): hold/release, holdTools/holdResults, paced text/results, custom events.
- `harnessAvailable` (harness-available.ts:4): core-chat.it.test.ts:44,65.
- `harnessModes` (harness-modes.ts:13): 0 external consumers (only own test :419).
- call-tool (call-tool.ts): `makeCallTool`:96 (4 files), `makeDiscoverTools`:82 (5: ios/recorder/tanstack/test-runner/whiteboard tests), `makeRunTypescript`:58 (3), `approvePending`:180 (2: cli.test.ts:24). `autoApprove`:131, `withAutoApproval`:147, `makeApprovingCallTool`:173, `makeApprovingRegistryCall`:192 = 0 external consumers (dead public API).
- `connectMcpClient` (mcp-client.ts:44): 10 files (plugin tests, core-testkit.ts:8).
- `approvalIds` (run-events.ts:43): 0 real consumers (core-api.it:4334 is a local param of same name).
- `makeRpcClient`/`resolveSession` (session.ts:3,5): makeRpcClient 29 files, resolveSession 6.
- `serveApp` (serve-app.ts:10): core-api.it:348,598.
- login re-exports `requestPrintedCode/exchangePrintedCode/loginThroughTerminal` (login.ts:27,40,46): cli.test.ts:24, core-testkit.ts:7.
- `./until` `until(pred, {hangGuardMs, settleFor, failWhen})` (until.ts:16): 7 files via subpath (core.test.ts:169, embed.it:39, site/test/helpers.ts:7, conciv.browser.test.tsx:20) + root re-export.
- `./login` also `magicLink`:54, `trustedBrowserToken`:58, `recordedEngineBase`:62: 8 files (embed/test/helpers.ts:20, e2e-utils widget.ts:3, widget-suite.ts:8, tanstack.browser:12).
- `./rpc-mounts` `serveRpcRouter({router})` (rpc-mounts.ts:18): 2 files (core.test.ts:168, plugin-testkit.test.ts:15).
  Cost: in-process; one HTTP server + temp dir per kit.

## 2. @conciv/plugin-testkit

Purpose: the engine kit plugins/widget tests use; Playwright-page wire tools for oRPC-over-WS.
Exports (package.json exports):

- `./core-kit` `bootCoreKit(opts)` (core-kit.ts:44): createFakeHarness + createTestkit + real `makeApp` from @conciv/core/app with a hand-built cfg (core-kit.ts:85-112), awaits activation; adds editorOpened, forSession, home, writeProjectFile. 13 files: all plugins tests (ios.test.ts, recorder.test.ts, tanstack*, test-runner.test.ts, try-it.browser, whiteboard*), embed/test/helpers.ts:7, embed.it:53, apps/conciv core-control.ts:23 / conciv.test.ts:3.
- `./widget-suite` (widget-suite.ts): `serveStaticDir`:39, `openPluginWidget(browser,{plugins,widgetBundle})`:105 (bootCoreKit + static host page + Chromium page + magicLink login), `widgetComponentSuite({id,distDir})`:132 (3 shared tests for framework wrappers). 9 files: plugins/*.browser|it tests, embed/test/unit/embed.test.ts:7, preact|react|solid/test/widget.it.test.ts.
- `./rpc-socket` `rpcSocketFor(page)` (rpc-socket.ts:83) intercept WS frames with rules: 7 files.
- `./rpc-observer` `observeRpc`/`rpcObserverFor` (rpc-observer.ts:80,190): 5 files (unplugin plugin.it:39, whiteboard.browser:15).
- `./rpc-fault` `failRpcCalls`:70 `abortRpcCalls`:81 `garbleRpcReplies`:87 `holdRpcCalls`:100 `gateRpcCalls`:128: 3 files.
- `./rpc-counts` `rpcCallCursor`:10 `rpcCallMark`:21: 3 files.
- `./chat-fault` `failChatTurns`:8 `dropChatTurns`:12: 1 file (core-testkit.ts:6).
- `./chat-wire` `watchChatWire` (chat-wire.ts:51): 1 file (embed.it:41).
- `./rpc-wire` `watchRpcWire` (rpc-wire.ts:18): 1 file (embed.it:59).
- `./connect-handshake` `completeConnectHandshake` (connect-handshake.ts:8): 1 file (embed.it:65).
- `./navigation-state` `currentHref(kit)` 6-line file (navigation-state.ts:3): 2 files.
- `./listen-local` `listenLocal(server)` (listen-local.ts:3): 2 files.
- `./host/grab` `makeImageHostGrab`:41 `makeHostGrab`:50: 1 file (unplugin plugin.it:868).
  Boots: in-process engine (makeApp + db in temp stateRoot) + HTTP; widget-suite also a static HTTP server and Chromium (via browser-fixture). Needs PREBUILT widget bundle (embed dist) passed in.
  Single-consumer subpaths (chat-wire, rpc-wire, connect-handshake, chat-fault, host/grab) are effectively embed.it/unplugin-private helpers published as API.

## 3. @conciv/browser-fixture

`test` = vitest `test.extend` with file-scoped `browser` = `chromium.launch()`, close bounded by p-timeout 30s (browser-fixture.ts:7-20). 9 importing files (site/test/helpers.ts:6, embed.test.ts:6, widget-suite.ts:7, 5 plugin browser/it tests). Cost: one Chromium per test file.

## 4. @conciv/plugin-page-testkit

`pageTabs()` -> {plugin, open} (page-tabs.ts:28): a plugin `page-tab-fixture` that answers `experimental.page` control/command/result as fake tabs, no browser. 4 files: cli.test.ts:36, client.test.ts:14, core-api.it:146, core.test.ts:134. No tests of its own, not built (exports `./src/page-tabs.ts`).

## 5. @conciv/vitest-config (private)

- `.` reporters.ts: `ciReporters`:12, `ciTest`:27, `ciTestSolidBrowser`:55, `browserOptimizeDeps`:77, timeouts :17-18 -> 56 vitest configs.
- `./temp-dir` `tempDir(prefix)` (temp-dir.ts:11), per-file root removed afterAll: 43 files.
- `./pack` buildAndPack/installPacked/assert* (pack.ts:137,193,218..): 8 e2e files (nextjs packed, vite-react-packed). Cost: builds tarballs + pnpm install.
- `./vite-lib` `solidLibConfig` (vite-lib.ts:7): 3 vite configs (not test).
- `./solid-cleanup` setup file: referenced only by reporters.ts:53.
- bins ci-shards/ci-summary (shards.ts, summary.ts); setup/conciv-home-setup.ts globalSetup.

## 6. @conciv/e2e-utils (private)

config.ts `e2eConfig`:67 `packedE2eConfig`:92 `harnessMatrixConfig`:131 (18 files); dev-endpoint.ts (14); ports.ts (2); widget.ts `collectFailures`:36 `expectWidgetBoots`:69 `loginWidget`:107 `trustedEngineBase`:115 `expectPluginBundleReloadsInPlace`:138 (15). Depends on harness-testkit/login. Boots: Playwright webServer dev servers per e2e app.

## 7. @conciv/ai/testkit

`storyConnection`:76 (scripted ConnectConnectionAdapter), `createTextChunks`:87, `createReasoningChunks`:96, `createToolResultChunk`:110, `createToolCallChunks`:130, `createApprovalChunk`:151, `runAdapterTurn`:155, `foldChatEvents`:161, re-exports `ChatClient`, `fakeText` (packages/ai/src/testkit.ts:13-14). 27 files incl. 10 stories in ui-kit-chat/apps/conciv + chat.test.ts:4, client.test.ts:3, core-api.it:40. Shipped in a product package's exports.

## 8. In-package test-support modules (not packages)

- apps/conciv/test/commands/core-control.ts (883 lines): vitest browser `commands` (`coreCommands`, :834) wiring bootCoreKit (:165-168) + fault injectors + TCP socket servers (:217, :620) so the browser test drives the engine. apps/conciv/test/commands/core-testkit.ts re-exports plugin-testkit/harness-testkit (lines 1-8, fallow entry .fallowrc.json:869).
- apps/conciv/test/helpers.browser.tsx (934), helpers.node.ts (171: `proxyTo`:45, static server :64).
- packages/core/test/helpers.ts (294): `bootKit`:158, `bootMadeApp`:170 (own makeApp cfg literal :171-183), `bootCoreApp`:210, `makeChatFixture`:230; defaults to REAL claude (`requireClaude` :32).
- packages/cli/test/helpers.ts (343): `bootCli`:51 (own makeApp cfg, sets process.env CONCIV_*).
- packages/client/test/helpers.ts (35): `bootClientKit`:8 (own makeApp cfg literal).
- packages/embed/test/helpers.ts (456): `bootEmbedKit`:34 (wraps bootCoreKit), `serveWidgetHost`:74, `hostPage`:118, `proxyTo`:163, `setupWidgetSuite`:240, panel/login drivers :292-452.
- packages/unplugin/test/helpers/dev-servers.ts (165): vite dev servers, `testTempDir`:63 (wraps vitest-config tempDir), `magicLinkUrl`:98.
- packages/mascot/test/e2e/helpers.ts (833), packages/plugin-host/test/core/{lib,fixture} (opencode copies: Effect test helpers, flock workers), packages/plugin-page/test/fixtures/page-tool-defs.ts (538), packages/plugins/{tanstack,try-it}/test/host/app.ts.

## 9. Overlaps (same job twice)

1. makeApp cfg literal for a fake-harness engine hand-built 4x: plugin-testkit core-kit.ts:85-112, core/test/helpers.ts:171-183, cli/test/helpers.ts:~30-47, client/test/helpers.ts:11-30. bootCoreKit could cover cli/client (both just fake harness + plugins/bridge).
2. `proxyTo` engine proxy written twice: apps/conciv/test/helpers.node.ts:45 and packages/embed/test/helpers.ts:163.
3. Widget host page + static server twice: widget-suite.ts:39-77 (`serveFiles`/`hostPage`) vs embed/test/helpers.ts:74 `serveWidgetHost` + :118 `hostPage`; apps/conciv helpers.node.ts:64 a third static server.
4. Chromium launch hand-rolled in unplugin plugin.it.test.ts:402,936,1002,1525 instead of browser-fixture.
5. Login: harness-testkit/login `magicLink` reused, but embed helpers `requestLoginCode`:300 and core-testkit re-export `requestPrintedCode` wrap the same.
6. Temp dirs: vitest-config tempDir vs create-testkit mkdtemp in OS tmp (create-testkit.ts:117) vs unplugin testTempDir.
7. Scripted chat: harness-testkit ScriptedRun (engine side) vs ai/testkit storyConnection (client side): different layers, not a true dup.
8. Fault injection: plugin-testkit rpc-fault/chat-fault (page wire) vs apps/conciv core-control.ts fault specs (:483-711) rebuilt as browser commands.

## 10. Gaps (hand-rolled, no testkit offers)

- No shared "engine proxy / dead port" helper (proxyTo x2, `reserveDeadPort` embed helpers.ts:139).
- No widget panel driver (open panel, send message, switch session): lives only in embed/test/helpers.ts:292-452 and apps/conciv helpers.browser.tsx.
- No clock injection for ScriptedRun pacing (audit: harness-testkit pacing tests use wall clock; test-audit-harness-testkit.md:93,113).
- plugin-page-testkit has no browser-side counterpart; page tools in a real browser use widget-suite only.

## 11. Dead / near-dead

- harness-testkit: `autoApprove`, `withAutoApproval`, `makeApprovingCallTool`, `makeApprovingRegistryCall` (0 external), `harnessModes` (0), `approvalIds` (0), `until({failWhen})` (0, audit), `ScriptedRun.hold()` (audit).
- plugin-testkit single-consumer subpaths (section 2).
- extension-testkit / extension-compiler: deleted; disk leftovers only. vitest-config shards still name `packages/extensions` and `@conciv/extension-design`.

## 12. What the specs say

- docs/specs/test-rewrite-after-port.md:43 wave 3 includes harness-testkit; :45 wave 5 includes plugin-testkit; :54-55 re-home tool-reply truncation cap from extension-testkit before deleting (now appears covered at core-api.it.test.ts:3875 `conciv:truncated`; verify); :56 concivSolidConfig optimizeDeps -> unplugin (plugin.it.test.ts:47,2164 exists); :62 open ruling on `vi.stubEnv` in vitest-config; :63-64 open ruling: delete harnessModes and until-failWhen with their tests.
- test-audit-harness-testkit.md: 1,016 lines, 52 rows: KEEP 25, MERGE 20, PROVES NOTHING 5, COVERED 3 (:76-83); consumer facts (:5-8); lean ~450-550, prerequisites delete harnessModes/failWhen/hold, add a clock (:113); rule breaks: wall-clock spans, 20-50 ms sleeps, `--expose-gc` flag never reverted, child busy-writer (:90-97).
- test-audit-plugin-testkit.md: 487 lines, 13 tests, KEEP 11 MERGE 2 (:24); tests prove the tools not product (:3); extension-testkit duplicates die with it (:33); lean ~420 (:44).
- test-audit-summary-2.md:31 harness-testkit row, :47 plugin-testkit row, :51 extension-tooling (72/80 die), :135/:212 re-home truncation cap, :210 unused-API-kept-by-tests list.
