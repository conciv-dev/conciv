# harness-testkit/src

## Purpose

`harness-engine.ts` is the package entry, with `createHarnessEngine`. It writes `files` into a fresh project root, starts core with `makeApp` (only `plugins`, `permission` and `permissions` are read from `config`), serves it, writes `settings` through the settings rpc and opens the first session. After start a test scripts the model the way opencode's `TestLLM` does (`push`, `always`, `serve`, `wait`), and drives any session, its own or one reached by id, through the rpcs the widget itself calls.

- `scripted-harness.ts`: the harness the engine runs. A given adapter keeps everything but its chat, which answers each model request with the next queued reply, or else the `fallback` (set at start, replaced by `always` or `serve`), records what each model request was given (its messages, and of each tool only the name and description, since the tool's functions and schema objects do not serialize), and holds it while a gate is set; without one, the quick adapter with id `engine` does the same and also lists a fixed model list, the `model` and `deploy` slash commands, and a plain bash terminal.
- `test-llm.ts`: the reply shapes and helpers of opencode's test model, on `ChatEvent` chunks (usage and finish reason ride on `RUN_FINISHED`, reasoning on the `REASONING_MESSAGE_*` chunks), and the shape of one recorded request, named apart from `@conciv/ai`'s product `ModelRequest`.
- `call-tool.ts`: a session's tool call, run through `execute_typescript` on `/api/mcp`.
- `until.ts`: the private wait `approve` uses until the session has a pending ask.

## Invariants

- `send` resolves when the turn's run finishes, fails or is stopped.
- `requests` is a copy of the model requests recorded so far, in arrival order, recorded before a gate holds them; after `send` resolves or a gate's `started` settles, it holds that request.
- A session's `stop` sends the chat stop rpc, as a session-scoped client the way the widget's Stop does, for the session's active run and every run the kit started on it; it resolves when the engine answers, and the run's `send` then resolves.
- A request with no queued reply and no fallback fails its run, as opencode's test model defects.
- `wait(count)` resolves once `count` model requests have arrived, woken by each arrival, not by polling.
- `approve` waits up to 5000 ms for a pending ask, then answers every pending ask with the given reply (`once` unless told).
- Every session operation goes through a session-scoped client, as the widget's does; `messages` is what `chat.hydrate` gives the widget, and `sessions` reads every page of `sessions.list`.
- A turn leaves the open list when its `send` settles, so `stop` names only live runs.
- A tool call gives up after 60000 ms; a tool error rejects with its text, which `failure` returns.
- `stop` ends open turns, closes the server, disposes the app and removes the project root; every step runs even when an earlier one fails, and the failures are rethrown as one `AggregateError`. A failed start undoes what it did the same way.
