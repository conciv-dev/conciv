# @conciv/harness-testkit

## Overview

Starts the real conciv engine (`@conciv/core`) on a local port with a scripted AI chat, for tests. The entry exports `createHarnessEngine(options)`, `quickHarness(options)` and the `TestLLM` reply helpers; `@conciv/harness-testkit/test-llm` holds the reply helpers alone, with no engine and no Node built-ins, so a browser test can build replies. A harness author passes the real adapter, and its chat runs through the scripted replies while its models, commands and history stay its own. Without a harness the engine uses its own quick harness: a fixed model list with a `Claude` group and an `Older versions` group, two slash commands (`model`, `deploy`), and a terminal that is a plain bash shell printing one start line (`model <id> <cols>x<rows>`). So the app's model picker, slash command and terminal journeys run with no CLI; real adapters are proven in e2e. `models` and `commands` replace the quick harness's lists for one engine, and an empty list means none. `harnesses` adds more harnesses to the engine for the harness switch; `quickHarness({id, models, commands})` makes one, and every harness's chat runs through the same scripted replies. `@conciv/plugin-testkit` builds its `createEngine` on it.

`package.json` exports the tsdown build in `dist`, with `.d.ts` from the declarations-only tsdown config (`tsdown.types.config.ts`). Source: [src](./src/README.md).

## Product path

The engine is the product's own `makeApp`, and the kit talks to it the way the product callers do: turns, settings, sessions and permission answers over the browser socket from `@conciv/contract`, tool calls over `/api/mcp` as an agent does. Only the AI chat is scripted.

## Replies

`replies` take the reply shapes of opencode's test model (`packages/ai/src/testing.ts` in opencode), on our `ChatEvent` chunks: an array of chunks, or an Effect `Stream` of them. Each model request takes the next reply. A tool turn takes two: the call, then the answer after the tool ran. A request with no reply left fails the run; there is no fallback reply. `TestLLM.text`, `TestLLM.toolCall`, `TestLLM.failAfter` and `TestLLM.hangAfter` build them. A session's `send` settles when the run ends and rejects with the run's error when it fails. `engine.gate()` holds the next model request until the test calls `release`, as opencode's `gate`; `stop` releases a held gate.

## The engine's own inputs

The options reach `makeApp` the way the product passes them, as opencode's test fixtures do (`tmpdir`, `withEnv`, `policy`): `env` is merged into the engine's config provider, never into `process.env`; `config.policies` are the organization policies, so a denied plugin does not load; `timings` are `makeApp`'s own timeouts (`firstChunkTimeoutMs`, `eventHeartbeatIntervalMs`, `stopGraceMs`, `pageReplyTimeoutMs`, `queuedActionTimeoutMs`), left at the product defaults unless a test sets them. `engine.files.read` and `engine.files.write` read and write a project file while the engine runs; a path is relative to the project root and one that resolves outside it is refused. A session's `answer(value)` answers the open UI question (`conciv_ui`) on `chat.uiReply`, and `switchHarness(id, model)` moves the session to another harness on `sessions.switchHarness`, as the widget does.

## Invariants

- The kit does not depend on a test runner at run time; its own node tests use vitest.
- The quick harness's terminal needs `bash` on the PATH.
- The harness writes the request's own thread and run ids into every run start, finish and error chunk of a reply.
- The harness prefixes every text and reasoning message id of a reply with the run id, so a reply given on several turns (`always`, `serve`, the `fallback`) shows on each of them.
- A streamed reply ends when the run is stopped.

## Side Effects

- Each engine makes a `conciv-kit-*` temp folder as its project root and binds a port on `127.0.0.1`; `stop` closes both.

## Verification

- `pnpm exec turbo run test --filter=@conciv/harness-testkit`: the quick harness's lists over the engine rpc, and a reply that fails part-way. Behaviour is also proven by the plugin tests that use `@conciv/plugin-testkit`.
