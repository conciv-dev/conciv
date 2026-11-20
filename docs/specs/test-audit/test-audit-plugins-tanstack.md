# Test audit: packages/plugins/tanstack/test/tanstack.browser.test.ts, packages/plugins/tanstack/test/tanstack.test.ts (267 + 428 = 695 lines, origin/main 51708bc06)

Read both start to end. Cross-checked against the old extension suites packages/extensions/tanstack/test/tanstack.test.ts (734) and tanstack.browser.test.tsx (560), which die with the extension system; test-audit-builtin-plugins-browser.md (2807 page tab redaction); e2e/nextjs packed-install.spec.ts:117 and e2e/tanstack-start widget.spec.ts:4; e2e/tanstack-start-redact.

## tanstack.browser.test.ts (267 lines, 1 test)

| line | describe > name                                                                                                                                | behaviour proved                                                                                                                                                                                                                                                                                                                                                                                  | level   | also covered at                                                                                                                                                                                                                                       | verdict | reason                                                                                                          | rule breaks |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- | ----------- |
| 106  | the tanstack plugin in the page > shows its chip, attaches to a draft chat once its first send makes it, reads the real location, navigates... | chip; attach on first send of a draft; router_state; tabs_list redacts token/access_token; navigate; query refetch/invalidate by exact key; refetch by redacted key; redaction of params/search/hash/query keys; loader reads as fetching on reload; long handler error code; thrown page error; newest of 50 long errors in order; router-less page says "router not found"; late-mounted router | browser | e2e/nextjs packed-install:117 (router not found + chip), e2e/tanstack-start widget:4 (chip text), e2e/tanstack-start-redact (redaction in a real app), builtin-plugins-browser 2807 (page-tab redaction, different code), ext tanstack.browser (dies) | KEEP    | the only browser proof of the TanStack operations; the e2e hits cover only the chip and router-not-found slices | -           |

## tanstack.test.ts (428 lines, 6 tests)

| line | describe > name                                                                                                                                         | behaviour proved                                                                                                                                                                               | level | also covered at                                                                                      | verdict        | reason                                                                          | rule breaks                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| 116  | the tanstack plugin without a bundler > is active, lists for code mode, loads its skill, reads the route manifest and tells the model why a tool failed | active; 3 engine tools in code mode; skill; route manifest (quotes, $param); ENOENT and bundler-unavailable failures; each also via `conciv plugin call` CLI                                   | it    | ext tanstack.test 490-652 (dies); test-audit-cli.md (plugin call CLI generic)                        | KEEP           | only plugin-side proof; the CLI repeat doubles runtime, could keep one CLI call | execFile CLI per assert (slow) |
| 208  | the tanstack plugin before a page attaches > offers its 3 engine tools while the browser tools are denied and no tab is listed                          | pre-attach surface                                                                                                                                                                             | it    | 269 (post-attach)                                                                                    | MERGE into 269 | the before-state is the first step of the attach journey                        | -                              |
| 217  | ... > refuses an attach to a session that was never created or was deleted, in the words page uses                                                      | attach refused for unknown/deleted session                                                                                                                                                     | it    | -                                                                                                    | KEEP           | only proof                                                                      | -                              |
| 269  | the tanstack plugin with a page attached > grants the browser tools to that session only, carries each call to the focused tab...                       | session-scoped grant; foreign tab refused; relay; failure codes; spoofed codes refused (rpc.invalid_input); abort cancels; unfocused tab routing; disconnected_after_dispatch; replaced attach | it    | ext tanstack.test 713/725 (dies); plugin-page machine tests (generic page machine, different plugin) | KEEP           | page simulated over plugin rpc (real wire, no mock)                             | -                              |
| 365  | ... > times out a page that never answers and cancels the call on the page                                                                              | reply timeout cancels on page                                                                                                                                                                  | it    | plugin-page 446 (machine timeout, pure)                                                              | KEEP           | replyTimeoutMs 50 option (correct pattern)                                      | -                              |
| 382  | the tanstack plugin on a real Vite dev server > reads a real transform error and decodes server-function requests, also under a basepath                | build_errors from real Vite; serverFn trace with basepath                                                                                                                                      | it    | -                                                                                                    | KEEP           | only real-bundler proof                                                         | -                              |

## Summary

### 1. Counts (7 tests, 7 rows; no it.each, no skip/only)

KEEP 6, MERGE 1 (208 into 269), DUPLICATE 0, PROVES NOTHING 0, COVERED ELSEWHERE 0.

### 2. Lines today vs after

695 today; nothing deleted outright: 695. After the merge and dropping the per-assert CLI repeats about 640.

### 3. Journeys that would remain

- Browser page journey (106).
- Engine without bundler (116), attach refusal (217), attached relay (269 with 208), timeout (365), real Vite (382).

### 4. Cross-file duplicates (verified)

- Old extension tanstack.test 296-424, 490-652, 713/725 and tanstack.browser duplicate these; they die.
- e2e/nextjs packed-install:117 asserts "router not found" and the chip; e2e/tanstack-start widget:4 asserts "TanStack inspector active". Both are thin slices of 106; 106 stays because it is the only proof of every other operation.
- builtin-plugins-browser 2807 tests page-tab redaction in the page plugin, not the TanStack redaction code: not a duplicate.

### 5. Odd things and rule breaks

- 106 is a single 160-line test with ~15 behaviours; a failure early hides the rest.
- 116 repeats each check through `conciv plugin call` (execFile): one CLI round trip is enough; the CLI itself is tested in test-audit-cli.md.
- No mocks, no DOM reads, no sleeps. Package: 1 node + 1 browser file.

### 6. Shared state

Per-test engines and temp roots. None shared.

### 7. Rewrite input (lean)

Browser: split 106 into two journeys (router reads/navigation/redaction, errors and router-less page). Engine: surface+skill+manifest with one CLI call, attach lifecycle (refusal, grant, relay, timeout), real Vite. Lean estimate: about 560 lines.
