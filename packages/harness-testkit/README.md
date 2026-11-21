# @conciv/harness-testkit

## Overview

Starts the real conciv engine (`@conciv/core`) on a local port with a scripted AI chat, for tests. The entry exports `createHarnessEngine(config, start)` and the `TestLLM` reply helpers. `config` is the product's own `ConcivConfig`, as a `conciv.config` file would give it; `start` holds only what must be known before the engine starts and is not product config. A harness author passes the real adapter as `start.harness`, and its chat runs through the scripted replies while its models, commands and history stay its own. Without a harness the engine uses its own quick harness: a fixed model list with a `Claude` group and an `Older versions` group, two slash commands (`model`, `deploy`), and a terminal that is a plain bash shell printing one start line (`model <id> <cols>x<rows>`). So the app's model picker, slash command and terminal journeys run with no CLI; real adapters are proven in e2e. `@conciv/plugin-testkit` builds its `createEngine` on it. Two more entries import nothing from core and no node builtin, so browser mode loads them: `./test-llm`, the `TestLLM` helpers, and `./clock`, the engine clock's advance loop, which `@conciv/plugin-testkit`'s browser mode runs with its own step.

`package.json` exports the tsdown build in `dist`, with `.d.ts` from `tsc -p tsconfig.build.json`. Source: [src](./src/README.md).

## Product path

The engine is the product's own `makeApp`, and the kit talks to it the way the product callers do: turns, settings, sessions and permission answers over the browser socket from `@conciv/contract`, tool calls over `/api/mcp` as an agent does. Only the AI chat is scripted.

## Replies

The scripted model is one TanStack AI `fakeText` (`@tanstack/ai/testing`) per engine, shared by every scripted harness. `engine.reply(...replies)` appends to its queue and takes only a `TestLLM.Reply`: `TestLLM.text(value)`, `TestLLM.toolCall(id, name, input)`, `TestLLM.failAfter(error)` and `TestLLM.hang()` (a reply that stays open until the run is stopped). At run time a reply is the library's own `FakeResponse` or a function step. Each model request takes the next reply. A tool turn takes two: the call, then the answer after the tool ran. A request with no reply left fails the run; there is no fallback reply. `start.tokensPerSecond` is passed to `fakeText`, which then streams every reply's text at that pace. A session's `send` settles when the run ends and rejects with the run's error when it fails. `engine.gate()` holds the next model request until the test calls `release`, as opencode's `gate`; `stop` releases a held gate.

## Invariants

- The kit does not depend on a test runner at run time; its own node tests use vitest.
- The quick harness's terminal needs `bash` on the PATH.
- Each turn's adapter records the request with the turn's model and effort, keeps the harness id as its name, and sends a `fake.session-id` custom chunk after `fakeText`'s run start, which the engine records as the session's native id.
- A paced or held reply ends when the run is stopped.
- An engine made with `clock: 'test'` runs its Effect clock reads and sleeps on a test clock that moves only through `engine.clock`; on the real clock every `engine.clock` call rejects with a plain message.

## Side Effects

- Each engine makes a `conciv-kit-*` temp folder as its project root and binds a port on `127.0.0.1`; `stop` closes both.

## Verification

- `pnpm exec turbo run test --filter=@conciv/harness-testkit`: `src/harness-engine.test.ts`, the kit's own promises that no consumer test observes: replies taken in order and the error on an empty queue, the real clock refusing `engine.clock`, and a tool name that is not a plain identifier refused before a code-mode program is built. Behaviour is also proven by the plugin tests that use `@conciv/plugin-testkit`.
