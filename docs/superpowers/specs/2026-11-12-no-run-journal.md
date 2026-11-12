# Agent output without the run journal

Status: approved by Omri on 2026-11-12. Proven by a spike (`spike/no-run-journal`, commit 5557373b9, local only, never merged).

## Problem

Since #819 a fresh chat turn fails when the agent CLI takes more than 10 seconds to print its first stdout line:

`JournalAttachUnavailableError ... 'journal-stalled' ... delivered no bytes within 10000ms`

- Upstream cause, in `@tanstack/ai-sandbox@1.2.0`: `journalOptionsFor` (`dist/esm/durability.js:133-144`) carries `attachWaitMs` only when `durability.attach` is true. A fresh run is not an attach, so its journal read falls back to `firstByteTimeoutMs ?? 1e4` (`dist/esm/journal-reader.js:117`). Conciv passed its 30-second limit as `attachWaitMs: config.firstOutputTimeoutMs` in `createChatServer`, and it never arrived: the library's 10 seconds fired first on every fresh turn.
- Dependency patches are not allowed, so conciv cannot make the library carry the option. The journal stays off until upstream carries the limit on a fresh run.
- The message blames a killed shell. The agent is alive, only slow, and it is left running after the error.
- A cold `claude` start measured 7 to 10 seconds on a loaded machine, so this fails real turns, not only tests. Reproduced on plain main: `packages/core/test/core-chat.it.test.ts` "streams a real turn and resumes the session" failed 2 of 3 serial runs.

## What the journal gives conciv

No durability conciv uses, but two side effects it relied on without knowing (see "What turning it off took away").

- The journal exists so another host can take a run over later. Conciv never re-attaches: on startup it marks every still-running run aborted (`sweepAbandonedRuns`).
- A page reload does not kill a turn because of the delivery layer (the transport's own stream durability in `delivery.ts`), not because of the journal.
- The library's detach-on-disconnect branch only applies to an abort that is not a cancel. Every conciv abort is a cancel.

## Change

`withSandbox(sandbox, {runs, locks, durability: {...}})` becomes `withSandbox(sandbox, {locks})`. This is the library's documented way to run without durability. The agent's stdout is then read from its pipe, there is no first-byte check, and conciv's first-output watchdog (`guardedAdapter`, 30 seconds) is the single silence limit.

Everything that only existed for the journal goes: the `journalDir` config, the `durability` parameter threaded into `run()`, the journal folder under the state dir, their README lines, and any plumbing left unused (for example `stateRoot` on the chat plane deps, if nothing else reads it).

## What turning it off took away

`withSandbox`'s `setup` emits `sandbox.starting`, and `@tanstack/ai` sends a synthetic `RUN_STARTED` ahead of that first custom event. That happens before `withPersistence` reaches its `onConfig` and `onStart`, where it creates the run record and saves the incoming user message. With durability on, the same `setup` first did two things (`dist/esm/middleware.js:262` and `:274`):

1. `durability.runs.createOrResume(...)`: the run record exists before any client can see the run start.
2. `getPendingTurn(ctx, {optional: true})?.snapshot()`: the incoming user message is stored before any client can see the run start. This is `withPersistence`'s own pending-turn seam.

Without them a client that sees `RUN_STARTED` can find the thread idle (caught by `packages/core/test/core-api.it.test.ts`, `chatBusy` after `RUN_STARTED`), and a client that joins mid-turn hydrates a thread without the user's message and never shows it (caught by `packages/client/test/client.test.ts`, "a client mounting mid-turn hydrates the thread and rejoins the run in flight").

Conciv now does both in its own `conciv-run-record` middleware, placed after `withPersistence` and right before `withSandbox`: `stores.runs.createOrResume(...)`, then the same `getPendingTurn(ctx, {optional: true})?.snapshot()` call the sandbox library made. `getPendingTurn` is imported from `@tanstack/ai/adapter-internals`. Approved by Omri on 2026-11-12 with two conditions: only `getPendingTurn` is imported from that subpath, and only in that one place.

Rejected: saving the message in conciv code (a hand copy of the library's merge), and making the client reload the thread when the joined run ends (the user's message stays missing until then).

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

In the existing `packages/ai/test/ai.test.ts`, with the fake agent CLI. The test that asserted the stalled-journal failure is replaced. Keep the set lean: the 12-second case waits real seconds because passing the library's old 10-second limit is its subject; the silent case runs with a 5-second first-output limit; the reload and stop cases are fast. "The agent is gone" is asserted by waiting for the fake agent's socket to close, never by sampling its pid. No new test file.

Before merge the real-harness test in `packages/core/test/core-chat.it.test.ts` is run against the real `claude` CLI.
