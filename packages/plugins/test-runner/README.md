# @conciv/plugin-test-runner

The conciv test-runner plugin. It runs the project's tests in a separate process (vitest by default, or
playwright) and gives the agent three tools and one skill to drive it.

```ts
plugins: ['@conciv/plugin-test-runner']
plugins: [['@conciv/plugin-test-runner', {runner: 'playwright'}]]
```

- Tools: `test_runner_run({pattern?})` and `test_runner_status()` are direct tools the agent calls by name;
  `external_test_runner_list()` stays in code mode.
- Skill: `test-runner`, how to use the tools.
- RPC `test-runner`: `status`, `list`, `ui`, `run`, `stop` (error `UNAVAILABLE` with `{available: false, error}` when
  the runner cannot start) and the event `event`, one per live run step (`run-start`, `test`, `file-end`, `run-end`).
