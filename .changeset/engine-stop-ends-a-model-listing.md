---
'@conciv/protocol': patch
'@conciv/harness': patch
'@conciv/core': patch
---

Closing the dev server leaves no model-listing process behind: when the engine stops it ends a harness's model listing still running (such as `opencode models --verbose`) and waits for it to exit before the close resolves.

For harness authors: a `models` function now receives `{signal}`, an `AbortSignal` the engine aborts when it stops. Pass it to whatever lists the models (`execFile(..., {signal})`, a `fetch`, an SDK's abort controller) and settle once that child has exited. A `models` function that takes no parameter still type-checks, since a function with fewer parameters is assignable. `resolveHarnessModels(adapter, {signal})` now takes the signal and hands it on.
