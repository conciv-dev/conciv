# @mandarax/test-runner

Runner-agnostic test-runner adapters for mandarax (vitest today; jest/node-test/playwright are drop-in via the ChildRunnerSpec seam). Each adapter spawns a clean child that streams TestEvent NDJSON on fd 3.

Part of [mandarax](https://github.com/mandarax-dev/mandarax).
