# @conciv/test-runner

Runner-agnostic test-runner adapters for conciv (vitest today; jest/node-test/playwright are drop-in via the ChildRunnerSpec seam). Each adapter spawns a clean child that streams TestEvent NDJSON on fd 3.

Part of [conciv](https://github.com/conciv-dev/conciv).
