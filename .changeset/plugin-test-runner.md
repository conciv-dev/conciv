---
'@conciv/plugin-test-runner': patch
---

New package `@conciv/plugin-test-runner`: the test runner as a conciv plugin. Enable it with `plugins: ['@conciv/plugin-test-runner']` (or `['@conciv/plugin-test-runner', {runner: 'playwright'}]`). The agent drives it from code mode as `external_test_runner_test_runner({action: 'list' | 'run' | 'status', pattern?})`, guided by the plugin's `test-runner` skill. The `test-runner` plugin RPC answers `status`, `list`, `ui`, `run` and `stop` (`UNAVAILABLE` when the runner cannot start) and publishes each live run step as its `event` event.
