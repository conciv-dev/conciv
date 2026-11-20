# harness-testkit/src

## Purpose

`harness-engine.ts` is the package entry, with `createHarnessEngine`. It writes `files` into a fresh project root, starts core with `makeApp` (only `plugins`, `permission` and `permissions` are read from `config`), serves it, writes `settings` through the settings rpc and opens the first session.

- `scripted-harness.ts`: the harness the engine runs. A given adapter keeps everything but its chat, which answers each model request with the next of `replies`, records what each model request was given (its messages, and of each tool only the name and description, since the tool's functions and schema objects do not serialize), and holds it while a gate is set; without one, the quick adapter with id `engine` does the same and also lists a fixed model list, the `model` and `deploy` slash commands, and a plain bash terminal.
- `test-llm.ts`: the reply shapes and helpers of opencode's test model, on `ChatEvent` chunks, and the shape of one recorded model request.
- `call-tool.ts`: a session's tool call, run through `execute_typescript` on `/api/mcp`.
- `until.ts`: the private wait `approve` uses until the session has a pending ask.

## Invariants

- `send` resolves when the turn's run finishes, fails or is stopped.
- `requests` is a copy of the model requests recorded so far, in arrival order, recorded before a gate holds them; after `send` resolves or a gate's `started` settles, it holds that request.
- A session's `stop` sends the chat stop rpc, as a session-scoped client the way the widget's Stop does, for the session's active run and every run the kit started on it; it resolves when the engine answers, and the run's `send` then resolves.
- `approve` waits up to 5000 ms for a pending ask, then answers every pending ask once.
- A tool call gives up after 60000 ms; a tool error rejects with its text, which `failure` returns.
- `stop` ends open turns, closes the server, disposes the app and removes the project root; every step runs even when an earlier one fails, and the failures are rethrown as one `AggregateError`. A failed start undoes what it did the same way.
