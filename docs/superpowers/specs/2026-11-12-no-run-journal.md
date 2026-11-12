# Agent output without the run journal

Status: approved by Omri on 2026-11-12. Proven by a spike (`spike/no-run-journal`, commit 5557373b9, local only, never merged).

## Problem

Since #819 a fresh chat turn fails when the agent CLI takes more than 10 seconds to print its first stdout line:

`JournalAttachUnavailableError ... 'journal-stalled' ... delivered no bytes within 10000ms`

- The 10 seconds is the `@tanstack/ai-sandbox` default for the first byte of a run journal (`journal-reader.js`, `firstByteTimeout`). Conciv's own 30-second setting (`attachWaitMs: config.firstOutputTimeoutMs` in `packages/ai/src/server/chat-server.ts`) is only forwarded when attaching to an existing run (`durability.js`, `journalOptionsFor`), and conciv never attaches.
- The message blames a killed shell. The agent is alive, only slow, and it is left running after the error.
- A cold `claude` start measured 7 to 10 seconds on a loaded machine, so this fails real turns, not only tests. Reproduced on plain main: `packages/core/test/core-chat.it.test.ts` "streams a real turn and resumes the session" failed 2 of 3 serial runs.

## What the journal gives conciv

Nothing it uses.

- The journal exists so another host can take a run over later. Conciv never re-attaches: on startup it marks every still-running run aborted (`sweepAbandonedRuns`).
- A page reload does not kill a turn because of the delivery layer (the transport's own stream durability in `delivery.ts`), not because of the journal.
- The library's detach-on-disconnect branch only applies to an abort that is not a cancel. Every conciv abort is a cancel.

## Change

`withSandbox(sandbox, {runs, locks, durability: {...}})` becomes `withSandbox(sandbox, {locks})`. This is the library's documented way to run without durability. The agent's stdout is then read from its pipe, there is no first-byte check, and conciv's first-output watchdog (`guardedAdapter`, 30 seconds) is the single silence limit.

Everything that only existed for the journal goes: the `journalDir` config, the `durability` parameter threaded into `run()`, the journal folder under the state dir, their README lines, and any plumbing left unused (for example `stateRoot` on the chat plane deps, if nothing else reads it).

Not in scope: cleaning old `.conciv/runs` folders on existing installs (they were never pruned before either); the `detached_since` / `sandbox_key` columns stay because the run store contract requires them.

## Behaviour that must hold

| Behaviour                          | Before                            | After                                                                          |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| Agent silent 12 s, then answers    | fails at 10 s                     | completes, one agent process, stored once                                      |
| Agent silent past 30 s             | fails at 10 s, agent left running | fails at about 30 s with "the agent produced no output within 30s", agent gone |
| Client leaves mid-turn and returns | full turn once, agent not killed  | same                                                                           |
| Stop during a run                  | aborted, agent gone               | same                                                                           |
| Server killed mid-run              | agent keeps running to the end    | agent ends on its next write                                                   |

## Tests

In the existing `packages/ai/test/ai.test.ts`, with the fake agent CLI. The test that asserted the stalled-journal failure is replaced. Keep the set lean: the two slow cases wait real seconds because that is their subject; the reload and stop cases are fast. No new test file.

Before merge the real-harness test in `packages/core/test/core-chat.it.test.ts` is run against the real `claude` CLI.
