---
'@conciv/app': patch
---

With the test-runner plugin, the agent calls `test_runner_run` and `test_runner_status` directly, as it called the old `test_runner` tool; `test_runner_list` stays in code mode. A finished run draws the test card in the thread, as the old card did: the counts, each file with its tests, a failing test that opens to show its failure, and buttons that open the failing file and ask the agent to fix it. The live rows of a run are in the Tests tab.
