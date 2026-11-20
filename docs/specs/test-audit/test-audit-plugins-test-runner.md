# Test audit: packages/plugins/test-runner/test/test-runner.browser.test.ts, packages/plugins/test-runner/test/test-runner.test.ts (379 + 333 = 712 lines, origin/main 51708bc06)

Read both start to end. No old extension test-runner suite exists. No e2e suite covers the test runner. Cross-checked against test-audit-builtin-plugins-browser.md, test-audit-ui-kit-chat-cards.md, test-audit-conciv-browser.md: none renders the test-runner card or panel.

Fixture files (no verdict rows, they are inputs):

- packages/plugins/test-runner/test/fixtures/playwright-app/blocked.spec.ts, browser.spec.ts, fail.spec.ts, pass.spec.ts, package.json, playwright.config.ts
- packages/plugins/test-runner/test/fixtures/vitest-app/fail.test.ts, pass.test.ts, package.json, vitest.config.ts

The `test(...)` at test-runner.browser.test.ts:21 and test-runner.test.ts:52 sit inside template strings (fixture sources written to the temp project), not call sites; no rows.

## test-runner.browser.test.ts (379 lines, 4 tests)

| line | describe > name                                                                                                                                      | behaviour proved                                                                                                                                                                                                        | level   | also covered at                          | verdict        | reason                                                                            | rule breaks |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------- | -------------- | --------------------------------------------------------------------------------- | ----------- |
| 50   | the Tests panel of the test-runner plugin > lists the Tests tab, shows a failed start, a run the agent starts live, the run so far after a reload... | Tests tab: "No test run yet", unavailable (vitest missing) survives a tab switch; live run; reload keeps the run; summary; open failing file (observer sees plugin.call server open); Fix this prefill; 360 px viewport | browser | -                                        | KEEP           | only proof of the panel                                                           | -           |
| 133  | the test card of the test-runner plugin > draws a finished run in the thread: the summary, the files as disclosures the keyboard toggles...          | card summary, keyboard disclosures, open file, Fix this                                                                                                                                                                 | browser | 50 (open file + Fix this from the panel) | KEEP           | card is a different surface from the panel                                        | -           |
| 225  | ... > streams the run the agent starts into its card: the run in progress with each finished test, then the finished run                             | card live streaming across reload (script.holdResults)                                                                                                                                                                  | browser | 50 (live run in the panel)               | MERGE into 133 | same card; a held run that then finishes covers both the live and finished states | -           |
| 317  | ... > prefills a fix that names the project-relative file when two failing files share their last two segments                                       | Fix prefill path disambiguation                                                                                                                                                                                         | browser | -                                        | KEEP           | only proof of the path rule; could be a unit on the prefill builder               | -           |

## test-runner.test.ts (333 lines, 4 tests)

| line | describe > name                                                                                                                                                      | behaviour proved                                                                                                                                                                                             | level | also covered at                                                  | verdict | reason                                   | rule breaks               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------- | ------- | ---------------------------------------- | ------------------------- |
| 190  | the test-runner plugin on a vitest project > is active, lists for code mode, offers run and status as direct tools, lists, runs, streams a run live...               | active; list in code mode; run/status direct; streamed events (run-start, test, file-end, run-end, distinct ids for shared titles); pattern; status equals last run; rpc stop and engine stop kill the child | it    | browser 50/225 (consumer side)                                   | KEEP    | engine contract                          | vi.waitFor polling (fine) |
| 262  | the test-runner plugin when the runner cannot start > answers UNAVAILABLE when vitest is missing, and names the exit code or the signal when the child dies silently | UNAVAILABLE; exit code 7; SIGKILL                                                                                                                                                                            | it    | browser 50 (unavailable shown)                                   | KEEP    | exit-code/signal naming proven only here | -                         |
| 280  | the test-runner plugin on a playwright project > answers UNAVAILABLE without playwright, lists, runs, runs a pattern, and removes its report when stopped mid-test   | playwright adapter                                                                                                                                                                                           | it    | -                                                                | KEEP    | only playwright proof                    | -                         |
| 323  | the test-runner plugin with a runner that is not implemented > fails only this plugin and leaves the engine up                                                       | unimplemented jest runner isolated                                                                                                                                                                           | it    | test-audit-plugin-host-bus.md (generic plugin failure isolation) | KEEP    | runner-registry specific; cheap          | -                         |

## Summary

### 1. Counts (8 tests, 8 rows; no it.each, no skip/only)

KEEP 7, MERGE 1 (225 into 133), DUPLICATE 0, PROVES NOTHING 0, COVERED ELSEWHERE 0.

### 2. Lines today vs after

712 today; nothing deleted: 712. After the merge about 640.

### 3. Journeys that would remain

Browser: panel journey (50), card journey (133 with 225), prefill path (317). Engine: vitest (190), cannot start (262), playwright (280), unimplemented runner (323).

### 4. Cross-file duplicates (verified)

None. No old extension, no e2e, no other report touches the runner.

### 5. Odd things and rule breaks

- test-runner.test.ts `withChildEnvironment` mutates process.env (CONCIV_FIXTURE_BLOCKED_FILE, TMPDIR) for the child spawn: shared process state; parallel tests in the same worker would see it. Pass env to the spawn instead.
- The browser suite symlinks node_modules into the temp state root (temp dir; fine).
- No mocks, no DOM reads, no sleeps. Package: 1 node + 1 browser file.

### 6. Shared state

process.env mutation above. Otherwise per-test temp projects copied from fixtures.

### 7. Rewrite input (lean)

Keep as is minus the 225 merge; move the 317 path rule to a node unit. Lean estimate: about 600 lines.
