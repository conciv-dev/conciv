# @conciv/plugin-test-runner

The conciv test-runner plugin. It runs the project's tests in a separate process (vitest by default, or
playwright) and gives the agent three tools and one skill to drive it.

`./test-utils` is for tests: a fake of the run state the widget reads, which a test fills with events and a last result.

```ts
plugins: ['@conciv/plugin-test-runner']
plugins: [['@conciv/plugin-test-runner', {runner: 'playwright'}]]
```

- Tools: `test_runner_run({pattern?})` and `test_runner_status()` are direct tools the agent calls by name;
  `external_test_runner_list()` stays in code mode.
- Skill: `test-runner`, how to use the tools.
- RPC `test-runner`: `status`, `current`, `list`, `run`, `stop` (error `UNAVAILABLE` with `{available: false, error}` when
  the runner cannot start) and the event `event`, one per live run step (`run-start`, `test`, `file-end`, `run-end`).

## Invariants

- The engine needs the Effect `ChildProcessSpawner` service from the plugin host. Each run or list spawns
  `node <runner>-child.js` with fd 3 as an output pipe; the child writes one JSON `ChildMessage` per line on it.
  Lines that are blank, not JSON or not a `ChildMessage` are dropped.
- `NODE_OPTIONS` is removed from the child's environment.
- `run-machine.ts` holds the run: one child at a time (a second list or run waits its turn), the events of the
  run in progress (replayed to a new subscriber, returned by `current`), the last finished result and the last
  start failure, which lasts until the next `run-start`. A child that reports `error`, or exits non-zero or by a
  signal before any event, makes the call fail with `<runner> unavailable: <reason>`; a failed run also emits
  `run-unavailable`.
- `stop` and plugin dispose kill the child's process group (SIGTERM, SIGKILL after 5 seconds) and wait for it.
- jest and node-test are not implemented: choosing them fails the plugin at start.
- The playwright child waits for the whole `playwright test --reporter=json` run, then sends every event from the
  report (runId `pw1`, no `file-end`); its report goes to a temp directory that is removed when it exits or is
  stopped. The Vitest child drives the app's own `vitest/node` with a reporter that streams each event live.
- In the browser, `follow-machine.ts` reads `status` and `current` on every connect and applies only the newest
  read; `run-state.ts` folds the events into the status-tagged `RunView` the panel and the thread card draw.
- `plugin-experimental.tsx` adds the Tests tab and the thread card for `test_runner_run` and `test_runner_status`,
  drawn only through `ctx.ui` (conciv's own members read with `OpaqueUi.toInternal`); it imports no kit.
