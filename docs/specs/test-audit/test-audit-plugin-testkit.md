# Test audit: packages/plugin-testkit/test/plugin-testkit.test.ts (487 lines, origin/main 51708bc06)

Read start to end. These tests prove the test tools themselves (bootCoreKit, listenLocal, the rpc socket/gate/fault/observer helpers), not product behaviour. Cross-checked against packages/extension-testkit/test/extension-testkit.test.ts (dies with extensions) and test-audit-harness-testkit.md.

| line | describe > name                                                                                                                  | behaviour proved                              | level   | also covered at                                        | verdict        | reason                                                         | rule breaks                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- | ------------------------------------------------------ | -------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| 41   | core kit seams > bootCoreKit seams > adopts the harness transcript rows as external sessions with their transcript sizes         | kit seeds external sessions from harness rows | it      | -                                                      | KEEP           | seam used by plugin suites                                     | -                                                             |
| 64   | ... > serves the injected staleness probe to the widget rpc surface                                                              | injected staleness probe reaches rpc          | it      | -                                                      | KEEP           | seam                                                           | -                                                             |
| 71   | ... > lets a non-loopback origin through only when the kit declares it allowed                                                   | CORS 403 vs allowed origin                    | it      | test-audit-core-api-it.md origin checks (product side) | KEEP           | proves the kit option, not the product rule                    | -                                                             |
| 92   | ... > keeps a passed state root so a second kit on the same folder reads what the first one stored                               | stateRoot persists across kits                | it      | -                                                      | KEEP           | seam used by reopen tests (recorder 243, whiteboard 442)       | -                                                             |
| 114  | listen local > listenLocal > rejects instead of hanging when the requested port is already bound                                 | bound port rejects                            | it      | -                                                      | KEEP           | prevents hangs                                                 | -                                                             |
| 128  | rpc socket routing > a socket the page closes is closed on the engine too, ending the calls it carried                           | page-closed socket ends engine calls          | browser | -                                                      | KEEP           | real-browser socket lifecycle                                  | page.evaluate drives a WebSocket (driving, not a DOM read)    |
| 195  | rpc gate input pattern > a gate with an input pattern holds only the matching call, while the driver calls on the same path pass | gateRpcCalls by input pattern                 | browser | extension-testkit 280 (dies)                           | KEEP           | -                                                              | -                                                             |
| 238  | rpc observer dispose > dispose fails the pending waiter immediately instead of leaving its timer to fire naturally               | observer dispose rejects waiter               | browser | extension-testkit 306 (dies, duplicate)                | KEEP           | the surviving copy                                             | -                                                             |
| 255  | ... > dispose does not leak an unhandled rejection for a wait nobody awaited, and an awaited wait still rejects                  | no unhandled rejection on dispose             | browser | -                                                      | MERGE into 238 | same dispose; add the unawaited wait to 238                    | adds/removes a process unhandledRejection listener (restored) |
| 285  | rpc gate abandoned calls > a call the page aborts after its answer arrived is reported as given up...                            | abandoned call reported given up              | browser | -                                                      | KEEP           | -                                                              | -                                                             |
| 340  | rpc faults by input > a gate given an input holds only the calls whose input matches, and the others pass                        | gate by exact input                           | browser | 195                                                    | MERGE into 195 | same gate, exact input vs pattern; one test with both matchers | -                                                             |
| 384  | ... > a failure given an input fails only the calls whose input matches, and the others are answered                             | failRpcCalls by input                         | browser | -                                                      | KEEP           | -                                                              | -                                                             |
| 445  | push wire > a push socket counts as live once it opens, not when its handshake is sent                                           | push socket liveness                          | browser | -                                                      | KEEP           | -                                                              | -                                                             |

## Summary

### 1. Counts (13 tests, 13 rows; 5 `it`, 8 `browserTest`)

KEEP 11, MERGE 2 (255 into 238, 340 into 195), DUPLICATE 0, PROVES NOTHING 0, COVERED ELSEWHERE 0.

### 2. Lines today vs after

487 today; nothing deleted: 487. After merges about 440.

### 3. Journeys that would remain

Kit seams (41, 64, 71, 92), listenLocal (114), socket lifecycle (128), gate/fault matchers (195 with 340, 384, 285), observer dispose (238 with 255), push liveness (445).

### 4. Cross-file duplicates (verified)

extension-testkit 306 (observer dispose on close) duplicates 238; extension-testkit 263/280 overlap 195/340. The extension-testkit side dies.

### 5. Odd things and rule breaks

- Node and browser tests share one file (budget counts 1 file: fine).
- page.evaluate is used to open/close WebSockets in the page (driving input, not reading DOM).
- No mocks, no sleeps.

### 6. Shared state

A process-level unhandledRejection listener is added and removed inside 255. Kits are per test.

### 7. Rewrite input (lean)

Unchanged apart from the two merges. Lean estimate: about 420 lines.
