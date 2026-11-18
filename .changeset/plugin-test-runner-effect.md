---
'@conciv/plugin-test-runner': patch
---

The test-runner plugin's engine runs on Effect: the child process through `ChildProcessSpawner`, its run and the Tests panel's follow as pure machines, and one `RunnerUnavailable` error mapped at the rpc and tool edges. `@conciv/plugin-test-runner/view` exports `RunView`, `initialRunView` and `transitionRunView` in place of `RunState`, `initialRunState` and `transitionRun`.
