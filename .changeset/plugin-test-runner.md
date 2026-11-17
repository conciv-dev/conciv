---
'@conciv/plugin-test-runner': patch
---

New package `@conciv/plugin-test-runner`: the test runner as a conciv plugin. It runs the project's tests in a separate process, shows each run live in the Tests tab, and draws the test card in the thread when a run ends. The agent calls `test_runner_run` and `test_runner_status` directly and `external_test_runner_list()` from code mode, guided by the plugin's `test-runner` skill. Enable it with `plugins: ['@conciv/plugin-test-runner']`; pick the runner with its `runner` option, vitest by default or playwright: `plugins: [['@conciv/plugin-test-runner', {runner: 'playwright'}]]`.
