# Test baseline (BEFORE rewrite): CI run 44537686715, main 58b649460

## Notes

- tests/pass/fail/skip from CI shard reports (vitest JSON reporter via conciv-ci-shards). Vitest skip and todo are merged into one "skipped" status by summary.ts, so skippedOrTodo is one number.
- flaky is 0 everywhere: vitest reports have no retry info; Playwright reported no flaky cases.
- durationMs per package = wall time from first file start to last file end (summary.ts wallTime), summed across vitest projects of the package.
- testFilesRun = files seen in the vitest per-file lines of the 8 shard logs (a file run in two browser projects counts once).
- lineCoverage is null for packages whose run failed (coverage not written) or that disable coverage (browser-only projects).

## Totals (vitest, all shards)

| Packages | Test files | Tests | Passed | Failed | Skipped/todo | Flaky | Sum of package durations | Line coverage       |
| -------- | ---------- | ----- | ------ | ------ | ------------ | ----- | ------------------------ | ------------------- |
| 52       | 125        | 4372  | 4214   | 53     | 105          | 0     | 2773.0s                  | 78.0% (19257/24696) |

Packages without line coverage in CI: @conciv/app, @conciv/cli, @conciv/core, @conciv/db, @conciv/embed, @conciv/preact, @conciv/react, @conciv/solid, @conciv/ui-kit-chat, @conciv/ui-kit-chat-tools.

## Per package (vitest)

| Package                    | Shard | Files | Tests | Pass | Fail | Skip/todo | Duration | Line cov |
| -------------------------- | ----- | ----- | ----- | ---- | ---- | --------- | -------- | -------- |
| @conciv/ai                 | 7     | 1     | 142   | 47   |      | 95        | 32.6s    | 69.7%    |
| @conciv/app                | 1     | 18    | 572   | 546  | 26   |           | 1106.7s  |          |
| @conciv/brand              | 3     | 1     | 4     | 4    |      |           | 4.5s     | 94.7%    |
| @conciv/brand-react        | 7     | 1     | 4     | 4    |      |           | 4.6s     | 95.2%    |
| @conciv/builtin-plugins    | 6     | 1     | 114   | 114  |      |           | 32.2s    | 87.2%    |
| @conciv/bundle-size        | 3     | 1     | 13    | 13   |      |           | 0.0s     | 89.3%    |
| @conciv/chat               | 6     | 1     | 12    | 12   |      |           | 3.2s     | 72.9%    |
| @conciv/cli                | 3     | 1     | 362   | 353  | 9    |           | 76.8s    |          |
| @conciv/client             | 5     | 1     | 31    | 31   |      |           | 19.7s    | 79.5%    |
| @conciv/contract           | 3     | 1     | 28    | 28   |      |           | 6.8s     | 70.4%    |
| @conciv/core               | 4     | 4     | 364   | 346  | 14   | 4         | 80.5s    |          |
| @conciv/db                 | 3     | 1     | 30    | 29   | 1    |           | 7.2s     |          |
| @conciv/embed              | 6     | 1     | 87    | 87   |      |           | 342.3s   |          |
| @conciv/grab               | 5     | 1     | 15    | 15   |      |           | 0.2s     | 93.6%    |
| @conciv/harness            | 7     | 1     | 192   | 192  |      |           | 8.4s     | 95.2%    |
| @conciv/harness-init       | 5     | 1     | 29    | 29   |      |           | 3.4s     | 93.8%    |
| @conciv/harness-testkit    | 8     | 1     | 54    | 54   |      |           | 3.4s     | 61.4%    |
| @conciv/it                 | 5     | 1     | 4     | 4    |      |           | 2.0s     | 50.0%    |
| @conciv/mascot             | 6     | 2     | 102   | 102  |      |           | 78.5s    | 63.8%    |
| @conciv/mascot-react       | 5     | 2     | 26    | 25   |      | 1         | 3.7s     | 100.0%   |
| @conciv/oxlint-plugin      | 8     | 1     | 81    | 81   |      |           | 39.3s    | 94.1%    |
| @conciv/page               | 3     | 1     | 58    | 58   |      |           | 2.5s     | 85.0%    |
| @conciv/plugin             | 7     | 3     | 88    | 88   |      |           | 13.1s    | 80.9%    |
| @conciv/plugin-host        | 8     | 39    | 427   | 424  |      | 3         | 54.7s    | 87.0%    |
| @conciv/plugin-ios         | 4     | 1     | 160   | 160  |      |           | 2.2s     | 64.6%    |
| @conciv/plugin-page        | 7     | 1     | 82    | 82   |      |           | 2.2s     | 93.3%    |
| @conciv/plugin-recorder    | 7     | 2     | 46    | 46   |      |           | 64.2s    | 76.9%    |
| @conciv/plugin-tanstack    | 6     | 2     | 10    | 9    |      | 1         | 42.9s    | 59.7%    |
| @conciv/plugin-test-runner | 5     | 2     | 14    | 14   |      |           | 35.1s    | 77.7%    |
| @conciv/plugin-testkit     | 6     | 1     | 14    | 14   |      |           | 4.6s     | 80.0%    |
| @conciv/plugin-try-it      | 3     | 2     | 20    | 20   |      |           | 11.8s    | 97.1%    |
| @conciv/plugin-whiteboard  | 5     | 2     | 22    | 22   |      |           | 108.8s   | 71.9%    |
| @conciv/preact             | 4     | 1     | 3     | 3    |      |           | 4.5s     |          |
| @conciv/protocol           | 8     | 1     | 55    | 55   |      |           | 0.2s     | 85.5%    |
| @conciv/publish            | 4     | 1     | 64    | 64   |      |           | 6.1s     | 95.3%    |
| @conciv/react              | 4     | 1     | 3     | 3    |      |           | 4.5s     |          |
| @conciv/serve              | 4     | 1     | 9     | 9    |      |           | 0.8s     | 35.9%    |
| @conciv/skills             | 7     | 1     | 12    | 12   |      |           | 0.2s     | 94.6%    |
| @conciv/solid              | 6     | 1     | 3     | 3    |      |           | 7.3s     |          |
| @conciv/solid-streamdown   | 5     | 1     | 10    | 10   |      |           | 4.3s     | 77.6%    |
| @conciv/storage-history    | 3     | 1     | 16    | 16   |      |           | 0.0s     | 89.3%    |
| @conciv/tools              | 6     | 1     | 3     | 3    |      |           | 0.0s     | 100.0%   |
| @conciv/try                | 6     | 1     | 19    | 18   |      | 1         | 1.9s     | 63.7%    |
| @conciv/ui-kit-chat        | 8     | 5     | 222   | 220  | 2    |           | 113.8s   |          |
| @conciv/ui-kit-chat-tools  | 8     | 1     | 42    | 41   | 1    |           | 33.0s    |          |
| @conciv/ui-kit-system      | 4     | 2     | 272   | 272  |      |           | 30.1s    | 62.4%    |
| @conciv/ui-kit-tap         | 8     | 2     | 16    | 16   |      |           | 12.7s    | 77.7%    |
| @conciv/ui-kit-terminal    | 4     | 1     | 19    | 19   |      |           | 2.1s     | 95.3%    |
| @conciv/uno-preset         | 3     | 1     | 238   | 238  |      |           | 0.4s     | 65.7%    |
| @conciv/unplugin           | 2     | 1     | 103   | 103  |      |           | 352.2s   | 87.1%    |
| @conciv/vitest-config      | 7     | 1     | 49    | 49   |      |           | 0.9s     | 73.6%    |
| site                       | 7     | 1     | 7     | 7    |      |           | 0.0s     | 77.3%    |

## 20 slowest tests

| #   | Package                   | Test                                                                                                                                         | Status | Duration |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| 1   | @conciv/app               | a fixture plugin driven like a user a plugin that throws from its panel focus, its panel list or its reactive slot loses only that contribut | failed | 90.3s    |
| 2   | @conciv/app               | settings page a journey through every settings tab that saves, applies, survives a reload and resets                                         | failed | 60.1s    |
| 3   | @conciv/app               | a fixture plugin driven like a user a page overlay that hides the chat takes the chat out of reach by role and by Tab, and closing it brings | failed | 45.2s    |
| 4   | @conciv/plugin-whiteboard | the whiteboard canvas of the whiteboard plugin opens from its composer pill, draws with the keyboard and the pointer at its real size, drags | passed | 37.7s    |
| 5   | @conciv/plugin-whiteboard | the whiteboard comment tools raises each failure to the caller with its message                                                              | passed | 33.5s    |
| 6   | @conciv/ui-kit-chat-tools | tool row projections projects a Write call as a write row and an Edit call as an edit row                                                    | failed | 30.5s    |
| 7   | @conciv/ui-kit-chat       | assistant action bar reveal says the copy did not land when the clipboard refuses a keyboard-activated copy                                  | failed | 30.5s    |
| 8   | @conciv/app               | chat history paging scrolling up loads the older page well before the top, and the messages in view stay where they were                     | failed | 30.2s    |
| 9   | @conciv/app               | chat history paging the replies on screen are kept, not rebuilt, when the page before them lands                                             | failed | 30.0s    |
| 10  | @conciv/core              | engine boot writes .conciv/mcp-endpoint.json releases the port when the endpoint file cannot be written                                      | failed | 30.0s    |
| 11  | @conciv/embed (chromium)  | embed.it.test.ts › forced drop › a queued message survives the chat stream giving up › the queued text is back in the composer, the answered | passed | 27.9s    |
| 12  | @conciv/unplugin          | webpack and rspack a second dev run on another port, on the same persistent cache webpack builds the new port into the page and rebuilds aft | passed | 23.5s    |
| 13  | @conciv/app               | session selector a user opens, searches, pages, picks by keyboard and by pointer, and the search follows the index                           | passed | 20.8s    |
| 14  | @conciv/plugin-tanstack   | the tanstack plugin in the page shows its chip as a passive status with a tooltip, attaches to a draft chat once its first send makes it, re | passed | 20.8s    |
| 15  | @conciv/unplugin          | webpack and rspack the widget on the page of a development build webpack watching puts the launcher on the page, and the widget unlocks agai | passed | 20.7s    |
| 16  | @conciv/app               | terminal panel the toolbar picks the CLI model and keeps it across a reload, starts a new terminal, locks while the CLI is busy, and shows o | passed | 17.8s    |
| 17  | @conciv/app               | a fixture plugin driven like a user its tool card body comes back after the thread evicts it, and its store survives a reload and refuses a  | failed | 17.2s    |
| 18  | @conciv/app               | a fixture plugin driven like a user its tab shows once trusted, through a revoke, a lost connection and trust dropped before its enable stat | failed | 16.5s    |
| 19  | @conciv/app               | a fixture plugin driven like a user its engine ref reads the event connection: down while the engine is offline, up again when it returns, a | failed | 16.1s    |
| 20  | @conciv/app               | a fixture plugin driven like a user its panel reads the routed session idle, then running once a turn starts, and its interrupt stops the ru | failed | 16.0s    |

## 10 slowest test files

| #   | File                                                        | Project                        | Tests         | Duration |
| --- | ----------------------------------------------------------- | ------------------------------ | ------------- | -------- |
| 1   | apps/conciv/test/conciv.browser.test.tsx                    | browser (chromium)             | 335 26 failed | 1084.1s  |
| 2   | packages/unplugin/test/plugin.it.test.ts                    |                                | 103           | 352.2s   |
| 3   | packages/core/test/core-api.it.test.ts                      | node                           | 238 11 failed | 78.0s    |
| 4   | packages/cli/test/cli.test.ts                               |                                | 362 9 failed  | 76.9s    |
| 5   | packages/core/test/core.test.ts                             | node                           | 108 3 failed  | 71.3s    |
| 6   | packages/plugins/whiteboard/test/whiteboard.browser.test.ts | plugin-whiteboard              | 4             | 61.6s    |
| 7   | packages/ui-kit-chat/test/composer.browser.test.tsx         | ui-kit-chat-browser (chromium) | 60 1 failed   | 48.0s    |
| 8   | packages/plugins/whiteboard/test/whiteboard.test.ts         | plugin-whiteboard              | 18            | 45.7s    |
| 9   | packages/plugins/recorder/test/recorder.it.test.ts          | plugin-recorder                | 11            | 42.0s    |
| 10  | packages/oxlint-plugin/test/oxlint-plugin.test.ts           |                                | 81            | 39.4s    |

## Storybook browser tests

Test files: 3 failed | 133 passed | 1 skipped (137); tests: 3 failed | 442 passed (445); duration 39.69s.

## E2E (per app and shard)

| App                               | Shard   | Runner     | Tests | Pass | Fail | Flaky | Skip | Duration |
| --------------------------------- | ------- | ---------- | ----- | ---- | ---- | ----- | ---- | -------- |
| site                              | shard-1 | vitest     | 51    | 46   | 5    |       |      | 106.6s   |
| conciv-e2e-init                   | shard-1 | playwright | 10    | 10   |      |       |      | 2.1s     |
| conciv-e2e-nextjs-component       | shard-1 | playwright | 1     | 1    |      |       |      | 2.6s     |
| conciv-e2e-solid-start            | shard-1 | playwright | 1     | 1    |      |       |      | 4.4s     |
| conciv-e2e-tanstack-start-redact  | shard-1 | playwright | 1     | 1    |      |       |      | 5.1s     |
| conciv-e2e-nextjs                 | shard-2 | playwright | 4     | 3    | 1    |       |      | 14.2s    |
| conciv-e2e-svelte                 | shard-2 | playwright | 1     | 1    |      |       |      | 2.7s     |
| conciv-e2e-vite-react-component   | shard-2 | playwright | 1     | 1    |      |       |      | 4.3s     |
| conciv-e2e-vite-react             | shard-2 | playwright | 1     | 1    |      |       |      | 5.8s     |
| conciv-e2e-vite-vanilla           | shard-2 | playwright | 3     | 3    |      |       |      | 6.5s     |
| conciv-e2e-astro                  | shard-3 | playwright | 1     | 1    |      |       |      | 2.2s     |
| conciv-e2e-harnesses (claude)     | shard-3 | playwright | 2     | 2    |      |       |      | 10.9s    |
| conciv-e2e-harnesses (codex)      | shard-3 | playwright | 2     | 2    |      |       |      | 5.9s     |
| conciv-e2e-harnesses (gemini-cli) | shard-3 | playwright | 2     | 2    |      |       |      | 8.3s     |
| conciv-e2e-harnesses (opencode)   | shard-3 | playwright | 2     | 2    |      |       |      | 12.7s    |
| conciv-e2e-harnesses (pi)         | shard-3 | playwright | 2     | 2    |      |       |      | 4.9s     |
| conciv-e2e-tanstack-start         | shard-3 | playwright | 2     | 2    |      |       |      | 8.1s     |
| conciv-e2e-vite-preact-component  | shard-3 | playwright | 1     | 1    |      |       |      | 3.4s     |
| conciv-e2e-vite-solid-component   | shard-3 | playwright | 1     | 1    |      |       |      | 4.4s     |
| conciv-e2e-vite-solid             | shard-3 | playwright | 2     | 2    |      |       |      | 7.9s     |
| **total**                         |         |            | 91    | 85   | 6    | 0     | 0    | 222.8s   |

Playwright durations are summed per case (summary.ts playwrightTime), not wall time.

## CI job wall times (run wall time 21m59s)

| Job                         | Conclusion | Wall   |
| --------------------------- | ---------- | ------ |
| build + test (shard-1)      | failure    | 21m25s |
| build + test (shard-6)      | success    | 10m45s |
| build + test (shard-2)      | success    | 8m36s  |
| e2e consumer apps (shard-1) | failure    | 6m30s  |
| e2e consumer apps (shard-3) | success    | 4m45s  |
| build + test (shard-5)      | success    | 4m43s  |
| build + test (shard-8)      | failure    | 4m38s  |
| e2e consumer apps (shard-2) | failure    | 4m02s  |
| build + test (shard-7)      | failure    | 3m55s  |
| build + test (shard-3)      | failure    | 3m50s  |
| build + test (shard-4)      | failure    | 3m25s  |
| Storybook browser tests     | failure    | 2m43s  |
| repo checks                 | failure    | 2m07s  |
| e2e summary                 | success    | 0m15s  |
| plan                        | success    | 0m14s  |
| test summary                | success    | 0m14s  |
| plan-e2e                    | success    | 0m12s  |
| zizmor                      | success    | 0m11s  |
| e2e consumer apps           | failure    | 0m05s  |
| build + test                | failure    | 0m04s  |

## Top 20 test files by lines (static, test-files.json)

| #   | File                                                           | Lines | Describes | Tests |
| --- | -------------------------------------------------------------- | ----- | --------- | ----- |
| 1   | apps/conciv/test/conciv.browser.test.tsx                       | 13300 | 90        | 334   |
| 2   | packages/core/test/core-api.it.test.ts                         | 9109  | 76        | 237   |
| 3   | packages/cli/test/cli.test.ts                                  | 6220  | 83        | 284   |
| 4   | packages/core/test/core.test.ts                                | 5387  | 27        | 112   |
| 5   | packages/harness/test/harness.test.ts                          | 3259  | 72        | 173   |
| 6   | packages/embed/test/e2e/embed.it.test.ts                       | 3001  | 57        | 226   |
| 7   | packages/mascot/test/e2e/mascot.it.test.ts                     | 2866  | 15        | 109   |
| 8   | packages/builtin-plugins/test/builtin-plugins.browser.test.tsx | 2837  | 38        | 114   |
| 9   | packages/unplugin/test/plugin.it.test.ts                       | 2220  | 35        | 84    |
| 10  | packages/ui-kit-chat/test/composer.browser.test.tsx            | 2138  | 14        | 60    |
| 11  | packages/ui-kit-chat/test/thread.browser.test.tsx              | 1969  | 21        | 56    |
| 12  | packages/plugins/recorder/test/recorder.test.ts                | 1612  | 30        | 36    |
| 13  | packages/ui-kit-system/test/ui-kit-system.browser.test.tsx     | 1587  | 24        | 75    |
| 14  | packages/plugin-host/test/core/bus.test.ts                     | 1400  | 1         | 51    |
| 15  | packages/plugins/whiteboard/test/whiteboard.test.ts            | 1284  | 13        | 18    |
| 16  | packages/ui-kit-chat/test/cards.browser.test.tsx               | 1277  | 17        | 50    |
| 17  | packages/plugins/whiteboard/test/whiteboard.browser.test.ts    | 1246  | 3         | 5     |
| 18  | packages/page/test/page.browser.test.tsx                       | 1199  | 22        | 58    |
| 19  | packages/ai/test/ai.test.ts                                    | 1169  | 11        | 37    |
| 20  | packages/plugin/test/plugin.test.ts                            | 1085  | 12        | 52    |

Static totals: 156 test files, 102539 lines, 1124 describes, 3760 tests.

<!-- COVERAGE -->

## Local coverage (all four metrics), commit 58b649460 (this lane's packages; the other 10 are merged in by another lane)

Env: GITHUB_ACTIONS=1 TURBO_CONCURRENCY=1 VITEST_MAX_FORKS=1 (coverage on via ciTest; v8, json-summary). Run one package at a time under /tmp/conciv-gate.lock. Test script's trailing `playwright test` dropped (Playwright adds no vitest coverage).

| Package                    | Lines                | Statements          | Branches            | Functions          | Tests exit | Note                                                                                                                              |
| -------------------------- | -------------------- | ------------------- | ------------------- | ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| @conciv/ai                 | 69.68%               | 65.24%              | 49.1%               | 62.5%              | 0          |                                                                                                                                   |
| @conciv/brand              | 94.66%               | 86.02%              | 66.66%              | 88.88%             | 0          |                                                                                                                                   |
| @conciv/brand-react        | 95.16%               | 89.18%              | 62.96%              | 90%                | 0          |                                                                                                                                   |
| @conciv/builtin-plugins    | 87.21%               | 81.69%              | 71.12%              | 76.54%             | 0          |                                                                                                                                   |
| @conciv/bundle-size        | 89.32%               | 88%                 | 80%                 | 93.47%             | 0          |                                                                                                                                   |
| @conciv/chat               | 72.86%               | 68.19%              | 59.92%              | 71.48%             | 0          |                                                                                                                                   |
| @conciv/client             | 79.54%               | 76.56%              | 64.21%              | 80.23%             | 0          |                                                                                                                                   |
| @conciv/contract           | 70.41%               | 66.66%              | 43.67%              | 56.05%             | 0          |                                                                                                                                   |
| @conciv/grab               | 93.61%               | 93.1%               | 82.14%              | 91.66%             | 0          |                                                                                                                                   |
| @conciv/harness            | 95.19%               | 92.36%              | 81.05%              | 94.53%             | 0          |                                                                                                                                   |
| @conciv/harness-init       | 93.75%               | 86.66%              | 57.14%              | 96.29%             | 0          |                                                                                                                                   |
| @conciv/harness-testkit    | 61.41%               | 57.7%               | 52.87%              | 51.26%             | 0          |                                                                                                                                   |
| @conciv/it                 | 50%                  | 50%                 | 100%                | 100%               | 0          |                                                                                                                                   |
| @conciv/mascot             | 63.76%               | 59.19%              | 38.84%              | 49.01%             | 0          |                                                                                                                                   |
| @conciv/mascot-react       | 100%                 | 95.15%              | 79.74%              | 98.68%             | 0          |                                                                                                                                   |
| @conciv/oxlint-plugin      | 94.11%               | 94.59%              | 80%                 | 100%               | 0          |                                                                                                                                   |
| @conciv/page               | 85.03%               | 80.91%              | 68.4%               | 77.88%             | 0          |                                                                                                                                   |
| @conciv/plugin             | 80.92%               | 78.45%              | 64.98%              | 69.46%             | 0          |                                                                                                                                   |
| @conciv/plugin-host        | 86.14%               | 83.11%              | 71.3%               | 79.12%             | 0          |                                                                                                                                   |
| @conciv/plugin-ios         | 64.3%                | 60.65%              | 56.08%              | 48.41%             | 0          |                                                                                                                                   |
| @conciv/plugin-page        | 93.26%               | 90.66%              | 79.65%              | 89.62%             | 0          |                                                                                                                                   |
| @conciv/plugin-recorder    | 77.02%               | 76.22%              | 66.91%              | 70.62%             | 0          |                                                                                                                                   |
| @conciv/plugin-tanstack    | 57.36%               | 55.5%               | 38.66%              | 41.37%             | 0          |                                                                                                                                   |
| @conciv/plugin-test-runner | 77.22%               | 74.84%              | 71.16%              | 64.08%             | 0          |                                                                                                                                   |
| @conciv/plugin-testkit     | 80%                  | 74.93%              | 69.54%              | 64.82%             | 0          |                                                                                                                                   |
| @conciv/plugin-try-it      | 97.1%                | 97.67%              | 95.83%              | 92.3%              | 0          |                                                                                                                                   |
| @conciv/plugin-whiteboard  | 71.26%               | 70.83%              | 58.66%              | 64.89%             | 0          |                                                                                                                                   |
| @conciv/protocol           | 85.46%               | 79.69%              | 61.13%              | 61.79%             | 0          |                                                                                                                                   |
| @conciv/publish            | 95.32%               | 92.55%              | 81.48%              | 95.42%             | 0          |                                                                                                                                   |
| @conciv/serve              | 35.87%               | 36.07%              | 30.66%              | 29.31%             | 0          |                                                                                                                                   |
| @conciv/skills             | 94.55%               | 91.3%               | 75%                 | 93.93%             | 0          |                                                                                                                                   |
| @conciv/solid-diffs        |                      |                     |                     |                    | 0          | no coverage written: vitest.config does not use ciTest (no coverage, no JSON reporter), so CI shard reports also omit its 4 tests |
| @conciv/solid-streamdown   | 77.55%               | 73.97%              | 68.1%               | 88.96%             | 0          |                                                                                                                                   |
| @conciv/storage-history    | 89.28%               | 88.88%              | 94.73%              | 80.95%             | 0          |                                                                                                                                   |
| @conciv/tools              | 100%                 | 90%                 | 50%                 | 100%               | 0          |                                                                                                                                   |
| @conciv/try                | 64.83%               | 64.48%              | 75%                 | 51.85%             | 0          |                                                                                                                                   |
| @conciv/ui-kit-system      | 62.4%                | 59.78%              | 39.84%              | 65.74%             | 0          |                                                                                                                                   |
| @conciv/ui-kit-tap         | 77.66%               | 72.23%              | 58.36%              | 74.87%             | 0          |                                                                                                                                   |
| @conciv/ui-kit-terminal    | 95.26%               | 90.94%              | 80.64%              | 90.54%             | 0          |                                                                                                                                   |
| @conciv/uno-preset         | 65.71%               | 63.88%              | 100%                | 20%                | 0          |                                                                                                                                   |
| @conciv/unplugin           | 87.11%               | 82.49%              | 71.26%              | 80%                | 0          |                                                                                                                                   |
| @conciv/vitest-config      | 73.56%               | 72.8%               | 57.92%              | 85.02%             | 0          |                                                                                                                                   |
| **total**                  | 77.76% (19186/24673) | 74.4% (22437/30157) | 63.47% (9207/14505) | 70.85% (7072/9981) |            |                                                                                                                                   |

Worktrees: the first 10 packages (tools .. plugin-page) ran in aidx-wt-integration at 58b649460; at 16:43 another session checked a branch out there, so the other 32 were rerun in a dedicated detached worktree <workspace>/aidx-wt-baseline at 58b649460 (all green). The discarded wrong-commit results are in runs/wrong-commit/.

Skipped: conciv-storybook: vitest.config sets coverage.enabled=false (CI never measures it); tanstack-start-example: no test script; site + e2e/*: excluded by brief; other lane: @conciv/app, cli, core, db, embed, preact, react, solid, ui-kit-chat, ui-kit-chat-tools: measured by another lane (coordinator split).
