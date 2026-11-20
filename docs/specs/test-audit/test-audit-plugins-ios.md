# Test audit: packages/plugins/ios/test/ios.test.ts (576 lines, origin/main 51708bc06)

Read start to end. Cross-checked against the old extension suite packages/extensions/ios/test/ios.test.ts (978 lines, dies with the extension system), every existing report in this folder and every e2e suite (none touches iOS).

| line | describe > name                                                                                                                               | behaviour proved                                                                                                | level     | also covered at                              | verdict        | reason                                                                                                                  | rule breaks |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| 70   | the ios plugin in an engine > offers screenshot and logs in code mode, keeps build and run direct, and answers not configured from every tool | tool surface split (code mode vs direct) and the unconfigured answer from all four tools, through a real engine | it        | ext ios:950, ext ios:965, ext ios:490 (dies) | KEEP           | only plugin-side proof of the tool surface; the ext copies die                                                          | -           |
| 95   | the ios plugin in an engine > asks before building or running a configured app, and a denial runs nothing                                     | approval ask on build/run; a denial never reaches simctl                                                        | it        | -                                            | KEEP           | only proof of the ask gate for iOS                                                                                      | -           |
| 125  | ios config > reads no options as unconfigured, normalizes concivUrl to the api base and keeps extra source dirs                               | config parsing: unconfigured, /native strip, extraSourceDirs                                                    | unit/node | ext ios:298-340 (dies)                       | KEEP           | pure parser, cheap; ext copy dies                                                                                       | -           |
| 154  | the ios system prompt text > describes the native overlay, names the served app, rules out filesystem crawls and steers to the build loop     | prompt text content                                                                                             | unit/node | ext ios:359-397 (dies)                       | KEEP           | string asserts on prompt; cheap; could shrink to 2 key phrases                                                          | -           |
| 192  | the real simctl runner > stops the child process when the run is interrupted                                                                  | interrupt kills the spawned child (real process)                                                                | it        | -                                            | KEEP           | only real-process proof; fs watch, no sleep                                                                             | -           |
| 315  | the ios tools against a fake simctl > reports swiftc diagnostics, or the raw stderr when a failed compile has none                            | compile failure surfaces diagnostics or stderr                                                                  | unit/node | ext ios:499-917 band (dies)                  | KEEP           | hand-written fake Layer (a fake service, not a mock)                                                                    | -           |
| 341  | ... > builds in swiftc mode with extra source roots into the assembled app, honoring developerDir                                             | swiftc invocation args + developerDir env                                                                       | unit/node | ext band (dies)                              | MERGE into 443 | both assert the swiftc build command/steps on the same fake; one build test can check roots, developerDir and packaging | -           |
| 365  | ... > builds in xcodebuild mode: diagnostics without an app path on failure, the settings app path on success                                 | xcodebuild failure/success                                                                                      | unit/node | ext band (dies)                              | KEEP           | only xcodebuild-mode proof                                                                                              | -           |
| 386  | ... > reads the app path from xcodebuild settings by bundle id and app wrapper                                                                | parseXcodebuildAppPath pure parse                                                                               | unit/node | 365 (success path reads the same settings)   | MERGE into 365 | 365 already exercises the parse on success; keep the bundle-id branch as one extra assert there                         | -           |
| 410  | ... > runs the app: boot, install, terminate and launch on the booted udid, with the conciv url and autoshow env                              | run step order + CONCIV_URL/AUTOSHOW env                                                                        | unit/node | ext band (dies)                              | KEEP           | only proof of run sequence and env                                                                                      | -           |
| 443  | ... > checks every packaging step of a swiftc build                                                                                           | plutil/codesign/Info.plist steps                                                                                | unit/node | ext band (dies)                              | KEEP           | absorbs 341                                                                                                             | -           |
| 471  | ... > picks the available simulator among duplicate names                                                                                     | device selection among duplicates                                                                               | unit/node | ext band (dies)                              | KEEP           | real bug class                                                                                                          | -           |
| 492  | ... > names the stage a run stopped at                                                                                                        | failing run names its stage                                                                                     | unit/node | ext band (dies)                              | MERGE into 410 | same run path with one injected failure; one table-driven run test covers both                                          | -           |
| 538  | ... > captures the screen as a png data uri with its size                                                                                     | screenshot data uri                                                                                             | unit/node | ext band (dies)                              | KEEP           | only screenshot shape proof                                                                                             | -           |
| 549  | ... > reads recent log lines with a window and a limit, and reports a missing simulator or a bad predicate                                    | logs window/limit + error answers                                                                               | unit/node | ext band (dies)                              | KEEP           | only logs proof                                                                                                         | -           |

## Summary

### 1. Counts (15 tests, 15 rows; no it.each, no skip/only)

KEEP 12, MERGE 3 (341 into 443, 386 into 365, 492 into 410), DUPLICATE 0, PROVES NOTHING 0, COVERED ELSEWHERE 0.

### 2. Lines today vs after

576 today. Deleting dup+nothing+covered removes nothing: 576. After the 3 merges about 530.

### 3. Journeys that would remain

- Engine journey (70 + 95): tool surface, unconfigured answer, ask/deny gate.
- Fake-simctl build journey (315, 341+443, 365+386): swiftc and xcodebuild builds.
- Fake-simctl run journey (410+492, 471): run order, env, stage names, device pick.
- Device reads (538, 549).
- Real runner interrupt (192).

### 4. Cross-file duplicates (verified)

The whole fake-simctl band duplicates packages/extensions/ios/test/ios.test.ts 499-917, and 70/125/154 duplicate ext 950/965/490, 298-340, 359-397. The extension file is the side that dies; nothing here is dropped for it. No e2e covers iOS.

### 5. Odd things and rule breaks

None. The simctl Layer is a hand-written fake service (allowed), not vi.fn. No sleeps, no DOM, no jsdom. Package has one node file and no browser file: budget fine.

### 6. Shared state

Each test builds its own fake Layer and temp dirs. No module-level mutable state.

### 7. Rewrite input (lean)

One engine test (surface + ask/deny), one config+prompt unit, one table-driven build test (swiftc/xcodebuild), one run test (order/env/stage/duplicates), one reads test, one interrupt test. Lean estimate: about 380 lines.
