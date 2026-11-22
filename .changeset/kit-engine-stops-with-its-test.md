---
'@conciv/plugin-testkit': patch
---

An engine made by `createEngine` in a node test stops when its own test ends, also when the test runs in `describe.concurrent`: the kit's node setup holds each test's context for the test's whole run, so the stop is no longer registered on whichever test vitest started last.
