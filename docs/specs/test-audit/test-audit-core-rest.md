# Test audit: packages/core/test/core-chat.it.test.ts, packages/core/test/event-feed.test.ts (562 lines, origin/main 51708bc06)

Read start to end. core-chat.it.test.ts boots real engines (`bootKit`, `start`) with the fake harness or, behind `skipIf`, the real claude/codex/opencode CLIs: level it. event-feed.test.ts is a node unit test of `EventFeed`, copied from opencode (`server/src/event-feed.ts`, per packages/core/src/README.md) with a hand-written bus source. Cross-checked against test-audit-core.md (core.test.ts) and test-audit-core-api-it.md (core-api.it.test.ts), re-reading the other tests at origin/main.

### core-chat.it.test.ts (345)

| line | describe > name                                                                                                           | behaviour proved                                              | level | also covered at                                                                                                                       | verdict           | reason                                                                                                                       | rule breaks                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 30   | claude tanstack > ... > streams a real turn and resumes the session (skipIf CI)                                           | real claude turn + resume                                     | it    | e2e/harnesses:33 (real CLI, auth failure only)                                                                                        | KEEP              | only real-model resume proof; absorbs 50, 70 as `it.each`                                                                    | runs on every local non-CI run with claude installed (spends tokens) |
| 50   | codex tanstack > ... > streams a real turn and resumes the session (skipIf CI or no codex)                                | real codex turn + resume                                      | it    | -                                                                                                                                     | MERGE into 30     | same `assertTurnAndResume`, one table row                                                                                    | -                                                                    |
| 70   | opencode tanstack > ... (opt-in CONCIV_OPENCODE_IT=1)                                                                     | real opencode turn + resume                                   | it    | -                                                                                                                                     | MERGE into 30     | table row with its opt-in                                                                                                    | env-driven model                                                     |
| 105  | extension tool call id > ... > hands the tool the same call id the turn put on the wire                                   | code-mode call inside a chat turn carries the wire toolCallId | it    | core-api.it:2537 (hub registry call id = card id)                                                                                     | KEEP              | the turn/code-mode path is not the registry path 2537 proves; built on `defineExtension` (old system), port to a plugin tool | -                                                                    |
| 188  | registry extension tools > ... > appears in discover_tools with its declared summary and input                            | discover_tools shows summary + input                          | it    | core-api.it:3721 (discover_tools output shape, error codes)                                                                           | COVERED ELSEWHERE | core-api.it:3721 owns discover_tools                                                                                         | shared kit (`beforeAll`)                                             |
| 194  | ... > rejects malformed input with a loud validation error, never a silent success                                        | bad input -> error in sandbox                                 | it    | core-api.it code mode child cards ("errors (bad arguments too)")                                                                      | COVERED ELSEWHERE | core-api.it child-card test asserts bad-argument errors                                                                      | shared kit                                                           |
| 203  | ... > refuses to boot a tool declared without meta and an output schema instead of forwarding it                          | half-declared extension tool refused at boot                  | it    | -                                                                                                                                     | KEEP (old system) | only proof; dies with the extension system                                                                                   | -                                                                    |
| 238  | start dev endpoint > start pairing file > writes the endpoint on boot when a native page is served and removes it on stop | dev-endpoint.json written by `start`, removed on stop         | it    | core.test.ts:1059 (file helper: 0600, owner pid)                                                                                      | KEEP              | only proof that `start` writes and stop removes it; absorbs 254                                                              | -                                                                    |
| 254  | ... > serves /native open and writes the generated agent token into the endpoint when no access token is given            | generated token in endpoint; /native open                     | it    | core-api.it:1503 (unprefixed native page open)                                                                                        | MERGE into 238    | /native half is core-api.it:1503; the generated-token half is one more `withStartedEngine` call                              | -                                                                    |
| 277  | api mcp claude image > ... > delivers an image to claude so the model sees its pixels (skipIf CI)                         | real claude reads an image                                    | it    | core-api.it:2678, 3691 (image stored / tool bridge image block)                                                                       | KEEP              | only real-model image proof; opt-in                                                                                          | spends tokens                                                        |
| 336  | api mcp claude session header > ... > keeps honouring the conciv session header the owned and tty paths send              | `/api/mcp` session from `x-conciv-session`                    | it    | core.test.ts:2454 (calls scoped to the established session); core-api.it:2168 (MCP session from the header drives the session stream) | COVERED ELSEWHERE | the header path is what every core-api.it MCP test rides                                                                     | -                                                                    |

### event-feed.test.ts (217)

| line | describe > name                                                                                           | behaviour proved                 | level     | also covered at                                                   | verdict                    | reason                                                                                  | rule breaks                                              |
| ---- | --------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- | ----------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 45   | EventFeed > preserves the public event envelope encoding                                                  | `encode` envelope shape          | unit/node | core-api.it:5097, 7615 (`server.connected` envelope)              | KEEP                       | unit owns the encoder                                                                   | -                                                        |
| 55   | EventFeed > encodes once and delivers the same frame to every subscriber                                  | one encode, fan-out              | unit/node | -                                                                 | KEEP                       |                                                                                         | -                                                        |
| 80   | EventFeed > delivers only the requested event types to filtered subscribers                               | server-side type filter          | unit/node | core-api.it:7612 (`event.subscribe({types: ['plugin.updated']})`) | KEEP                       | unit edge, it proves the wire                                                           | -                                                        |
| 107  | EventFeed > fails only the subscriber that exceeds its lag capacity                                       | overflow isolation               | unit/node | -                                                                 | KEEP                       |                                                                                         | -                                                        |
| 153  | EventFeed > delivers events published without a location to public subscribers                            | no-location event delivered      | unit/node | 80                                                                | DUPLICATE of event-feed:80 | 80's unfiltered subscriber already receives the same no-location `Plugin.Event.Updated` | -                                                        |
| 173  | EventFeed > filters internal events before they consume subscriber capacity                               | internal events take no capacity | unit/node | -                                                                 | KEEP                       |                                                                                         | -                                                        |
| 192  | EventFeed > disconnects current subscribers after an encoding failure and continues for later subscribers | encoding failure scope           | unit/node | -                                                                 | KEEP                       |                                                                                         | `throw` inside a hand-written encoder (fake, not a mock) |

## Summary

### 1. Counts (18 rows; no expansion; 4 `skipIf` real-CLI rows)

| verdict           | rows                      |
| ----------------- | ------------------------- |
| KEEP              | 11 (incl. 203 old system) |
| MERGE             | 3                         |
| DUPLICATE         | 1                         |
| PROVES NOTHING    | 0                         |
| COVERED ELSEWHERE | 3                         |

### 2. Lines that would go

- Today: 562. Deleting 153, 188, 194, 336 (plus the `legacy`/`echo` fixtures only they use): about 80 lines -> about 480.

### 3. Journeys a lean rewrite would use

1. Real CLI smoke (opt-in): one `it.each` over claude/codex/opencode turn + resume, plus the claude image row. Absorbs 50, 70.
2. Engine boot files: `start` writes dev-endpoint (given and generated token), stop removes it. Absorbs 254.
3. Plugin tool call id in a code-mode turn (rewrite 105 on a plugin tool).
4. EventFeed unit: encode, fan-out, filter, overflow, internal filter, encoding failure.

### 4. Cross-file / cross-level duplicates (verified by reading)

- 188 = core-api.it:3721 (discover_tools summary/shape) on an extension fixture instead of the plugin fixture.
- 194 overlaps core-api.it code-mode child cards (bad arguments error).
- 254's `/native` fetch = core-api.it:1503 (unprefixed open page). 238/254 vs core.test.ts:1059: core.test proves the file helper (mode, owner pid), these prove `start`/`stop` wiring; not duplicates.
- 336 overlaps core.test.ts:2454 and every core-api.it MCP test that connects with the session header.
- 105 vs core-api.it:2537: different path (code-mode in a turn vs hub registry call).
- event-feed 153 = event-feed 80; 80 overlaps core-api.it:7612 at it level.

### 5. Odd things and rule breaks

- Test file budget: packages/core has two node files (core.test.ts, event-feed.test.ts) and two it files (core-api.it.test.ts, core-chat.it.test.ts).
- `claude tanstack` runs the real claude CLI on every local run outside CI (`runReal = !process.env.CI`), spending tokens and depending on the developer's login.
- 105, 188, 194, 203, 336 build fixtures with `defineExtension`/`defineTool` (old extension system).
- event-feed provides `TestClock`/`TestConsole` layers that no test uses.
- No mocks, spies or sleeps.

### 6. Shared state / order dependence

| shared thing                                                           | created at              | tests           | order/alone risk                                                                                       |
| ---------------------------------------------------------------------- | ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `shared.kit` (beforeAll)                                               | core-chat.it:173-185    | 188, 194        | 203 boots its own; read-only use, no order dependence                                                  |
| `cleanups` array                                                       | core-chat.it:99         | 105             | drained in afterEach                                                                                   |
| tempDirs created at describe collection (`realpathSync(tempDir(...))`) | core-chat.it:27, 47, 68 | 30, 50, 70      | created even when skipped                                                                              |
| real CLI login / transcripts                                           | user home               | 30, 50, 70, 277 | `removeTurnTranscripts` cleans claude transcripts for 277; 30-70 rely on `assertTurnAndResume` helpers |

### 7. Rewrite input (lean rewrite after the port)

- core-chat.it: real-CLI table + image (opt-in, CI-off), `start` endpoint wiring, plugin tool call id. Drop extension-only rows with the extension system.
- event-feed: keep 6 rows; fold into core.test.ts to meet the file budget.
- Estimated lean rewrite: about 380 lines (from 562).
