# Test audit: packages/plugins/whiteboard/test/whiteboard.browser.test.ts, packages/plugins/whiteboard/test/whiteboard.test.ts (497 + 786 = 1,283 lines, origin/main 51708bc06)

Read both start to end. Cross-checked against the old extension suites packages/extensions/whiteboard/test/whiteboard.test.ts (1,284) and whiteboard.browser.test.tsx (102), which die with the extension system; every report in this folder; every e2e suite (none covers the whiteboard).

## whiteboard.browser.test.ts (497 lines, 1 test)

| line | describe > name                                                                                                                             | behaviour proved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | level   | also covered at               | verdict | reason                                 | rule breaks                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------- | ------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 73   | the whiteboard canvas of the whiteboard plugin > opens from its composer pill, draws with the keyboard and the pointer, closes on Escape... | pill opens canvas; 'r' + pointer drag draws; Escape closes while a turn runs, composer keeps focus; agent draw lands in the draft while closed; reopen keeps drawing; Escape on chat layers keeps the canvas; draw/svg/mermaid; hostile svg never runs script; malformed svg refused; canvasPending.remove failure; garbled live writes then commit; PNG export; second tab catches up after reconnect (catchUpRetryMs 20); concurrent moves version tie-break; erase; draw-once; canvas outlives minimized chat; chunk load failure toast + retry | browser | ext whiteboard.browser (dies) | KEEP    | only browser proof of the whole canvas | hardcoded mouse coordinates for drags (geometry-coupled input, not an assert); console error listener (fine) |

## whiteboard.test.ts (786 lines, 9 tests)

| line | describe > name                                                                                                                                                | behaviour proved                                                                         | level | also covered at                              | verdict        | reason                                                              | rule breaks                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----- | -------------------------------------------- | -------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 319  | the whiteboard plugin > is active, serves its browser bundle and offers its twenty-two tools under the whiteboard namespace                                    | active, bundle served, 22 tools                                                          | it    | ext whiteboard.test 733 (dies)               | MERGE into 523 | surface check is one assert at the start of the canvas tool journey | -                                                                                                                                              |
| 337  | the whiteboard store and its rpc > keeps rows per room named by the input, reads one row by id, refuses foreign or empty updates and gates element versions    | per-room rows, NOT_FOUND across rooms, room/id smuggling refused, version CONFLICT, bulk | it    | ext whiteboard.test 733-1024 band (dies)     | KEEP           | security-relevant (smuggling)                                       | -                                                                                                                                              |
| 423  | ... > lets one tab at a time claim a pending row, and lets a claim that outlived its lease be taken again                                                      | pending claim lease                                                                      | it    | -                                            | KEEP           | fake Date (fine)                                                    | -                                                                                                                                              |
| 442  | ... > keeps its database in the project folder, where a second engine on that folder reads the board back                                                      | db location + reopen                                                                     | it    | ext whiteboard.test 1257 (dies)              | KEEP           | persistence proof                                                   | mkfifo held file (temp)                                                                                                                        |
| 488  | ... > announces each stored change as ids and a per-room cursor, and answers the missed changes since a cursor                                                 | change events + `since`                                                                  | it    | browser 73 (second tab catch-up consumes it) | KEEP           | wire contract                                                       | -                                                                                                                                              |
| 523  | the whiteboard canvas tools > draws into the draft through an open canvas, previews, exports, commits and discards                                             | draft/preview/export/commit/discard; svg colour injection neutralised; no canvas refused | it    | browser 73                                   | KEEP           | engine side of the draw tools; absorbs 319                          | -                                                                                                                                              |
| 588  | ... > leaves an abandoned draft when a turn is stopped, and commits it when a turn finishes                                                                    | turn stop/finish drives draft fate                                                       | it    | -                                            | KEEP           | only proof                                                          | -                                                                                                                                              |
| 618  | the whiteboard comment tools > creates, replies to, reads, lists and moves comments, sets pin state, and asks before deleting, clearing, resolving or removing | comment CRUD + approval ask (deny/approve, session scope)                                | it    | ext whiteboard.test 733-1024 band (dies)     | KEEP           | only plugin-side proof                                              | -                                                                                                                                              |
| 703  | ... > raises each failure to the caller with its message                                                                                                       | failure messages                                                                         | it    | -                                            | KEEP           | only proof                                                          | TIMING: waits out real EXPORT_DEADLINE_MS 10_000 and COMMIT_DEADLINE_MS 15_000 (src/tool/canvas/tools.ts:15-16), about 25 s; make both options |
| 723  | the whiteboard anchors > locates a component, anchors a comment to it, follows it when it moves, loses it when it changes, and enriches an inserted comment    | element_reference anchors fresh/moved/orphaned, enrichment                               | it    | ext whiteboard.test 1272 (dies)              | KEEP           | only proof                                                          | -                                                                                                                                              |

## Summary

### 1. Counts (10 tests, 10 rows; no it.each, no skip/only)

KEEP 9, MERGE 1 (319 into 523), DUPLICATE 0, PROVES NOTHING 0, COVERED ELSEWHERE 0.

### 2. Lines today vs after

1,283 today; nothing deleted: 1,283. After the merge about 1,265; runtime drops ~25 s once 703's deadlines are options.

### 3. Journeys that would remain

Browser canvas journey (73). Engine: store (337, 423, 442, 488), canvas tools (523 with 319, 588), comments (618, 703), anchors (723).

### 4. Cross-file duplicates (verified)

Old extension whiteboard.test 733-1024, 1257, 1272 duplicate store, comment and anchor tests here; they die. No e2e, no other report overlaps.

### 5. Odd things and rule breaks

- 703 waits out two product deadlines in real time (~25 s): rule break "waits out a product timeout". Expose EXPORT/COMMIT deadlines as options.
- 73 is one 420-line test with ~20 behaviours; split into 2-3 journeys.
- 73 drags with hardcoded coordinates; acceptable as input, but brittle to layout.
- No mocks, no DOM reads, no jsdom. Package: 1 node + 1 browser file.

### 6. Shared state

Per-test engines and temp project folders; fake Date restored per test.

### 7. Rewrite input (lean)

Browser: canvas draw/close/reopen journey, agent-draw + svg safety journey, multi-tab + failure journey. Engine: store+events, canvas tools+turns, comments+failures (with deadline options), anchors. Lean estimate: about 1,050 lines.
