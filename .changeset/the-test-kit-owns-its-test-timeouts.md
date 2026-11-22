---
'@conciv/plugin-testkit': patch
---

The test kit always runs tests and hooks with its own 30 second timeouts. A `testTimeout` or `hookTimeout` in the vitest config of a package that uses the kit no longer changes them.
