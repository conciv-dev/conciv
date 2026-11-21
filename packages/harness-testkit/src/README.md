# harness-testkit/src

## Purpose

`harness-engine.ts` is the package entry, with `createHarnessEngine`. It writes `files` into a fresh project root, starts core with `makeApp` (only `plugins`, `permission` and `permissions` are read from `config`), reads its configuration from the isolated environment with `env` laid over it, serves it, writes `settings` through the settings rpc and opens the first session. `policies` and `systemPrompt` go into the configuration as given (defaults: no policies, an empty system prompt, `'project'` hub access); `sessionId` goes through core's `resolveConfig`, which refuses an id that is not a conciv id, and the engine opens on that session instead of creating one. `timeouts` (`firstChunkTimeoutMs`, `eventHeartbeatIntervalMs`, `stopGraceMs`, `pageReplyTimeoutMs`, `queuedActionTimeoutMs`) are spread into `makeApp`.

- `scripted-harness.ts`: the harness the engine runs. A given adapter keeps everything but its chat, which answers each model request with the next of `replies`, records what each model request was given as plain data (its system prompts, messages, each tool's name, description and JSON Schema input, never the tool's functions, plus the configured model, effort and model options), and holds it while a gate is set; without one, the quick adapter with id `engine` does the same, takes the system prompt (`systemPrompt: 'flag'`), and also lists a fixed model list, the `model` and `deploy` slash commands, and a plain bash terminal.
- `test-llm.ts`: the reply shapes and helpers of opencode's test model, on `ChatEvent` chunks, and the shape of one recorded model request. It is also the `./test-llm` entry, which imports nothing from core and no node builtin, so browser mode can load it.
- `call-tool.ts`: a session's tool call on `/api/mcp`: a tool the engine lists by its own name (a direct tool) is called by that name, any other through `execute_typescript`; a reply of one text part is parsed as JSON, a reply of several parts comes back as its content list.
- `isolated-env.ts`: the environment the engine reads: the developer's own with provider keys, secrets and every `CONCIV_*` variable taken out, and `HOME`, the XDG folders and `TMPDIR` set inside the engine's state folder, as opencode's test runner does; `PATH` is kept.
- `run-tests.ts`: the `./run-tests` entry behind the `conciv-test` bin. It runs the package's own `vitest run` with the caller's arguments in a fresh home folder, with `isolated-env.ts`'s environment plus `PLAYWRIGHT_BROWSERS_PATH` set to the folder Playwright would use with the real environment (so browser mode finds the installed browsers), forwards SIGINT and SIGTERM, removes the folder when vitest exits, and exits with vitest's code.
- `until.ts`: the private wait `approve` uses until the session has a pending ask.

## Invariants

- `send` resolves when the turn's run finishes, fails or is stopped.
- `requests` is a copy of the model requests recorded so far, in arrival order, recorded before a gate holds them. Each is plain data: the system prompts as strings, the messages, each tool with its name, description and JSON Schema input, the model and effort the harness was configured with (or `null`), and the model options; after `send` resolves or a gate's `started` settles, it holds that request.
- A session's `stop` sends the chat stop rpc, as a session-scoped client the way the widget's Stop does, for the session's active run and every run the kit started on it; it resolves when the engine answers, and the run's `send` then resolves.
- `approve` waits up to 5000 ms for a pending ask, then answers every pending ask once.
- A tool call gives up after 60000 ms; a tool error rejects with its text, which `failure` returns.
- `stop` ends open turns, closes the server, disposes the app and removes the project root; every step runs even when an earlier one fails, and the failures are rethrown as one `AggregateError`. A failed start undoes what it did the same way.
