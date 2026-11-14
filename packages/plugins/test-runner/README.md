# @conciv/plugin-test-runner

The conciv test-runner plugin. It runs the project's tests in a separate process (vitest by default, or
playwright) and gives the agent one code-mode tool and one skill to drive it.

```ts
plugins: ['@conciv/plugin-test-runner']
plugins: [['@conciv/plugin-test-runner', {runner: 'playwright'}]]
```

- Tool: `external_test_runner_test_runner({action: 'list' | 'run' | 'status', pattern?})`.
- Skill: `test-runner`, how to use the tool.
- RPC `test-runner`: `status`, `list`, `ui`, `run`, `stop` (error `UNAVAILABLE` with `{available: false, error}` when
  the runner cannot start) and the event `event`, one per live run step (`run-start`, `test`, `file-end`, `run-end`).
