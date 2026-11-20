# Test audit: packages/plugin/test/client/shared-events.test.ts, packages/plugin/test/plugin.browser.test.tsx (557 + 303 = 860 lines, origin/main 51708bc06)

Read both start to end. Cross-checked against test-audit-plugin.md (which audits packages/plugin/test/plugin.test.ts), test-audit-plugin-host-bus.md, and packages/core/test/core.test.ts at origin/main.

Provenance: packages/plugin is the package copied from opencode. shared-events.test.ts was added in bf9bac496 (#885) and then changed in #911 and #917. It is probably a port of opencode's client event tests, but that is not verified: treat its names as copied from opencode. plugin.browser.test.tsx was added in c1ac99d99 and tests conciv's own reactive helpers (createKeyed, createLatest, createVisitState, usePlugin, bindPlugin). These were not copied from opencode.

## shared-events.test.ts (557 lines, 19 tests)

| line | describe > name                                                                                                                         | behaviour proved                           | level     | also covered at                                       | verdict        | reason                              | rule breaks                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------- | ----------------------------------------------------- | -------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| 70   | creation, subscription, and idle iterators are lazy                                                                                     | no source opens until read                 | unit/node | -                                                     | KEEP           | -                                   | non-null `!`                                                                     |
| 89   | pre-aborted subscribers do not open a source                                                                                            | pre-aborted subscribe opens nothing        | unit/node | 70                                                    | MERGE into 70  | same laziness property              | -                                                                                |
| 98   | multiple consumers share one source and receive live native and RPC events                                                              | one shared source fan-out                  | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 126  | a types filter delivers only the requested types plus server.connected                                                                  | types filter                               | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 140  | a slow consumer does not stall other subscribers                                                                                        | slow consumer isolation                    | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 162  | an idle consumer does not stall events for an active consumer                                                                           | idle consumer isolation                    | unit/node | 140                                                   | MERGE into 140 | idle is the zero-speed case of slow | -                                                                                |
| 185  | an idle consumer fails instead of buffering events without bound                                                                        | 4096 buffer cap                            | unit/node | -                                                     | KEEP           | memory guard                        | -                                                                                |
| 197  | source completion preserves events already buffered for an idle consumer                                                                | EOF keeps buffered events                  | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 217  | late consumers receive the latest connection marker but no business event replay                                                        | late consumer gets latest connected marker | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 242  | abort removes only its subscriber; last return closes the native source and resolves pending reads                                      | abort/return cleanup                       | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 265  | breaking a native for-await loop closes the last source                                                                                 | break closes source                        | unit/node | 242                                                   | MERGE into 242 | break is return()                   | -                                                                                |
| 280  | rapid resubscription opens a replacement while old cleanup finishes                                                                     | rapid resubscribe                          | unit/node | -                                                     | KEEP           | race                                | -                                                                                |
| 315  | source EOF finishes all consumers and permits a fresh subscription without retry                                                        | EOF then fresh subscribe                   | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 344  | source failures preserve error identity for every consumer and permit a new subscription                                                | error identity                             | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 368  | synchronous source creation failures reject subscribers without automatic retry                                                         | sync connect failure                       | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 382  | source activity fans out to every subscriber that asked for it                                                                          | activity fan-out                           | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |
| 424  | Conciv.make event stream > a direct reader sees server.connected again and the next event after the stream ends, fails or is refused... | reconnect status sequence                  | unit/node | core.test 2942 (stalled stream comes back end to end) | KEEP           | owner level                         | -                                                                                |
| 490  | ... > a heartbeat reaches no reader and counts as activity, and a stream that goes silent is reopened through reconnecting              | heartbeat swallowed; stall reopens         | unit/node | core.test 2942                                        | KEEP           | owner level                         | TIMING: waits a real idleTimeout of 2000 ms; use fake timers or a shorter option |
| 526  | ... > an events.on handler keeps receiving across a reopen and after it throws                                                          | handler survives reopen and throw          | unit/node | -                                                     | KEEP           | -                                   | -                                                                                |

## plugin.browser.test.tsx (303 lines, 6 tests)

| line | describe > name                                                                      | behaviour proved        | level   | also covered at | verdict | reason                                                       | rule breaks |
| ---- | ------------------------------------------------------------------------------------ | ----------------------- | ------- | --------------- | ------- | ------------------------------------------------------------ | ----------- |
| 117  | createKeyed > reruns per key and disposes the previous run                           | per-key rerun + dispose | browser | -               | KEEP    | test-audit-plugin.md confirms no overlap with plugin.test.ts | -           |
| 154  | createKeyed > keeps the run for an object source whose compared fields are unchanged | equals keeps run        | browser | -               | KEEP    | -                                                            | -           |
| 190  | createLatest > drops the reply of a request the source moved past                    | stale reply dropped     | browser | -               | KEEP    | -                                                            | -           |
| 226  | createVisitState > returns to its initial value on every visit of the session        | per-visit reset         | browser | -               | KEEP    | -                                                            | -           |
| 274  | usePlugin > throws outside a plugin contribution                                     | throws outside plugin   | browser | -               | KEEP    | cheap                                                        | -           |
| 280  | bindPlugin > renders the component under the provider's context                      | provider context        | browser | -               | KEEP    | -                                                            | -           |

## Summary

### 1. Counts (25 tests, 25 rows; no it.each, no skip/only)

- shared-events: KEEP 16, MERGE 3 (89 into 70, 162 into 140, 265 into 242).
- plugin.browser: KEEP 6.
- Totals: KEEP 22, MERGE 3, DUPLICATE 0, PROVES NOTHING 0, COVERED ELSEWHERE 0.

### 2. Lines today vs after

860 today; nothing deleted: 860. After merges about 800.

### 3. Journeys that would remain

Shared source unit block (laziness, fan-out, isolation, cap, EOF/errors, cleanup), Conciv.make reconnect block, reactive helper browser block.

### 4. Cross-file duplicates (verified against test-audit-plugin.md)

- test-audit-plugin.md:99 already notes the budget break: packages/plugin has two node files (plugin.test.ts, client/shared-events.test.ts) plus one browser file.
- plugin.browser.test.tsx shares nothing with plugin.test.ts (per test-audit-plugin.md, re-checked).
- 424/490 overlap core.test 2942 (origin/main), which proves the stalled stream recovering end to end. Keep both; core is the journey, this is the owner.

### 5. Odd things and rule breaks

- Test file budget: packages/plugin has 2 node files + 1 browser file. Fold shared-events.test.ts into plugin.test.ts as a describe.
- 490 waits a real 2000 ms idle timeout: a "waits out a product timeout" break. Use vi.useFakeTimers (allowed) or a shorter idleTimeout option.
- Non-null `!` assertions in shared-events.test.ts.
- packages/plugin is copied from opencode (keep source names).

### 6. Shared state

Each test makes its own source; no module-level mutable state.

### 7. Rewrite input (lean)

Move shared-events into plugin.test.ts as one describe; apply the 3 merges; fake timers in 490. Lean estimate: about 760 lines.
