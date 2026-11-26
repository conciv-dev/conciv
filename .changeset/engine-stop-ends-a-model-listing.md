---
'@conciv/types': patch
'@conciv/harness': patch
'@conciv/backend': patch
---

Closing the dev server ends a harness's model listing that is still running and waits for it, up to a grace of 5 seconds. For OpenCode the listing (`opencode models --verbose`) runs in its own process group, which gets SIGTERM when the engine stops: a CLI that exits on SIGTERM is gone before the close resolves; a CLI that ignores SIGTERM gets SIGKILL when the grace runs out, so the close (which waits the same grace) can resolve just before it is gone, and the engine prints that the OpenCode listing did not end. Codex lists its models without a child process. Claude's model probe is ended by the Agent SDK on the SDK's own timers (its stdin is closed, SIGTERM follows about 2 s later and SIGKILL about 5 s after that), so that probe can outlive the close by up to those delays. A listing that does not settle within the grace (for example a `models` function that ignores the signal) no longer holds the close: the engine prints which harness's listing did not end and closes without it.

For harness authors: a `models` function now receives `{signal}`, an `AbortSignal` the engine aborts when it stops. Pass it to whatever lists the models (a child process, a `fetch`, an SDK's abort controller) and settle once that child has exited. A `models` function that takes no parameter still type-checks, since a function with fewer parameters is assignable; if it never settles, it costs the close the full grace. `resolveHarnessModels(adapter, {signal})` now takes the signal and hands it on.
