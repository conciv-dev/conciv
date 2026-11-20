# Test audit: packages/chat/test/chat.test.ts (912 lines, origin/main 51708bc06)

Read start to end. Node tests that drive the chat plane with a fake text adapter (`fakeText()`, a hand-written adapter, not vi.fn). Level is it: real chat(), real stores, real code-mode sandbox. Cross-checked against test-audit-core.md (its line numbers refer to HEAD 992822d36; cited "per test-audit-core.md") and test-audit-core-api-it.md.

| line | describe > name                                                                                                                                                            | behaviour proved                                                                              | level | also covered at                                                                    | verdict        | reason                                                                                         | rule breaks |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| 109  | permission cards > a permission card is stored, replayed with its member, kept in order under overlapping writes, and removed without a grant                              | permission card storage, replay, ordering, removal                                            | it    | core permission journey 4035 (per test-audit-core.md)                              | KEEP           | ordering under overlapping writes is proven only here                                          | -           |
| 175  | plugin tools in code mode > an empty tool domain changes no list, a plugin tool runs through code mode with its hooks, and a name a built-in capability has is left out... | empty domain; before/after hooks; collision (built-in wins); file parts; files across a throw | it    | -                                                                                  | KEEP           | owner of code-mode plugin tools                                                                | -           |
| 358  | ... > a tool outside the listed budget is found by search and called through the returned path                                                                             | search finds an unlisted tool                                                                 | it    | core 306 search by param (per test-audit-core.md)                                  | MERGE into 175 | same code-mode setup; one search call added to 175                                             | -           |
| 438  | ... > a nested call in a resent unfinished message stays shown but out of what the model reads next                                                                        | nested call kept visible, excluded from model input                                           | it    | -                                                                                  | KEEP           | only proof                                                                                     | -           |
| 491  | refusal text > a declined call says the user denied the tool, also when a promise tool rethrew the decline...                                                              | denied / blocked / corrected / rethrown / wrapped refusal text                                | it    | -                                                                                  | KEEP           | model-facing wording contract                                                                  | -           |
| 640  | direct tools > a codemode false tool reaches the turn and the runner as its own tool, and a session that denies execute gets every plugin tool directly...                 | direct-tool surface in a turn                                                                 | it    | core 4291 MCP surface (per test-audit-core.md)                                     | KEEP           | turn surface differs from the MCP surface                                                      | -           |
| 752  | plugin instructions > the initial text is one more system prompt and an empty one adds none, the change text goes once in front of the user words...                       | instruction assembly into prompt                                                              | it    | core 4508 and 306 (per test-audit-core.md)                                         | KEEP           | owner level; the core copies are the ones to trim                                              | -           |
| 818  | the session prompt hook > a turn with no prompt hook never reaches the hook service, and a registered hook rewrites the words the model gets                               | no-hook short circuit; hook rewrite                                                           | it    | core "session prompt hook" 3667/3826 (per test-audit-core.md) for the rewrite half | MERGE into 175 | keep only the no-hook half (one assert in the hooks test); the rewrite half is covered in core | -           |
| 875  | stopping a run > a stop says whether it stopped a live run, a repeat stop does not, and the session settles once the run has ended                                         | stop result + single settle                                                                   | it    | -                                                                                  | KEEP           | race                                                                                           | -           |

## Summary

### 1. Counts (9 tests, 9 rows; no it.each, no skip/only)

KEEP 7, MERGE 2 (358 into 175, 818 into 175), DUPLICATE 0, PROVES NOTHING 0, COVERED ELSEWHERE 0.

### 2. Lines today vs after

912 today; nothing deleted: 912. After merges about 830.

### 3. Journeys that would remain

Permission cards (109), code-mode plugin tools (175 with 358 and the no-hook half of 818), resend (438), refusal text (491), direct tools (640), instructions (752), stop (875).

### 4. Cross-file duplicates (verified, core lines per test-audit-core.md)

- Core 306 (337-line chat plane test) covers search and instruction placement; chat 358 and 752 are the owner copies, so the core side should shrink.
- Core 3667/3826 rewrite via session prompt hook; chat 818 rewrite half is the duplicate.
- Core 4035 permission journey and 4291 direct tools on MCP overlap 109/640 at a different surface; keep both.

### 5. Odd things and rule breaks

- Module-level `model = fakeText()` with `setResponses` shared by every test, and an `asking` wrapper that answers 'per_turn' on every turn. Tests depend on each one resetting responses; order dependence is possible if one test fails mid-way.
- No vi mocks (fakeText is a hand-written adapter), no sleeps, no DOM. Package: 1 node file.

### 6. Shared state

The module-level fake model above. Stores are per test.

### 7. Rewrite input (lean)

Make the fake model per test. Fold 358 and the no-hook half of 818 into 175. Lean estimate: about 780 lines.
