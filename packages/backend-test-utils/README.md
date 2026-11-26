# @conciv/backend-test-utils

The conciv engine for engine tests, as `@backstage/backend-test-utils`: the real engine with `@conciv/simulation`'s scripted model in place of a CLI. This package never depends on `@conciv/backend`.

## Overview

Starts the real conciv engine on a local port with a scripted AI chat, for tests. The entry exports `createEngine(config, start)` and `startEngine`, built on `@internal/engine-kit` with `@conciv/backend-defaults`' `createBackend`, and the `TestLLM` reply helpers (one copy, `@conciv/simulation`'s `./test-llm`). `config` is the product's own `ConcivConfig`; `start` holds only what must be known before the engine starts and is not product config. A harness author passes the real adapter as `start.harness`, and its chat runs through the scripted replies while its models, commands and history stay its own. Without a harness the engine uses its own quick harness: a fixed model list with a `Claude` group and an `Older versions` group, two slash commands (`model`, `deploy`), and a terminal that is a plain bash shell printing one start line (`model <id> <cols>x<rows>`). The CLI runner lives in `@conciv/cli`'s own `test/utils`.

Source: [src](./src/README.md).

## Product path

The engine is the product's own `makeApp`, and the kit talks to it the way the product callers do: turns, settings, sessions and permission answers over the browser socket from `@conciv/contract`, tool calls over `/api/mcp` as an agent does. Only the AI chat is scripted.

## Replies

The scripted model is one TanStack AI `fakeText` (`@tanstack/ai/testing`) per engine, shared by every scripted harness. `engine.reply(...replies)` appends to its queue and takes only a `TestLLM.Reply`: `TestLLM.text(value)`, `TestLLM.toolCall(id, name, input)`, `TestLLM.toolCalls(...calls)` (several calls in one reply), `TestLLM.thinking(value, answer)` (reasoning, then the answer), `TestLLM.failAfter(error)` (its RUN_ERROR carries `error.code`, as a provider's does) and `TestLLM.hang()` (a reply that stays open until the run is stopped). At run time a reply is the library's own `FakeResponse` or a function step. Each model request takes the next reply. A tool turn takes two: the call, then the answer after the tool ran. A request with no reply left fails the run; there is no fallback reply. `start.tokensPerSecond` is passed to `fakeText`, which then streams every reply's text at that pace. A session's `send` settles when the run ends and rejects with the run's error when it fails. `engine.gate()` holds the next model request until the test calls `release`, as opencode's `gate`; `stop` releases a held gate.

## Past sessions

A scripted harness takes `sessions`, plain data named as the product's `HarnessSessionMeta`: `{id, cwd?, derivedTitle, updatedAt, messages}`, where `cwd` left out is the project the engine runs in and another folder is another project. With it the harness reports `transcriptHistory` and `resume` (the command is the harness id then the session id) and its `history` answers from that data the way the real readers do: `list` newest first through `@conciv/harness/page` `pageAfter`, a folder with no sessions is empty, `tail` pages back at a user message with an `earlier` cursor, an unknown id has no `meta`. Without `sessions` nothing changes. Example: `createEngine({}, {harnesses: [{id: 'engine', sessions: [{id: 'past-1', derivedTitle: 'Fix the login form', updatedAt: Date.now() - 86_400_000, messages: [{id: 'm1', role: 'user', parts: [{type: 'text', content: 'why does login fail'}]}]}]}]})`.

A scripted harness also takes `contextWindow` and `contextTokens`, the two numbers the pane's context meter reads. Each run's RUN_FINISHED usage carries `providerUsageDetails.contextWindow`. For `contextTokens`, the kit writes the number to the session's transcript file under `<project>/.conciv/scripted-transcripts` before the run ends, and the harness's `history.contextTokens` reads it back, so core records it on the session as it does for a real CLI. `contextTokens` gives the harness a `history` (with no sessions unless `sessions` is given), so it reports `transcriptHistory` and `resume`. A session seeded through `sessions` in such a test has no transcript file until a run writes one, so it does not resume on its first turn.

## Invariants

- The kit does not depend on a test runner at run time; its own node tests use vitest.
- The quick harness's terminal needs `bash` on the PATH.
- Each turn's adapter records the request with the turn's model and effort, keeps the harness id as its name, and sends a `fake.session-id` custom chunk after `fakeText`'s run start, which the engine records as the session's native id.
- A paced or held reply ends when the run is stopped.
- An engine made with `clock: 'test'` runs its Effect clock reads and sleeps on a test clock that moves only through `engine.clock`; on the real clock every `engine.clock` call rejects with a plain message.

## Side Effects

- Each engine makes a `conciv-kit-*` temp folder as its project root and binds a port on `127.0.0.1`; `stop` closes both.
- `engine.home` is the engine's conciv home. `createEngine(config, {home: engine.home})` starts a second engine on it, so both share global settings and the home's engine registry. The home lives in the first engine's temp root, so `stop` on that engine removes it. The engine writes settings to disk 100 ms after each change and when it closes, so a test restarts the first engine before it reads that state from the second one.
- `createEngine(config, {git: true})` makes the temp project a git repository (branch `main`, one empty `initial` commit, `.conciv/` excluded, no global or system git config) and `engine.commit(message)` commits every change on top. A fixture folder cannot take `git: true`.
