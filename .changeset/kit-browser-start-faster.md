---
'@conciv/plugin-testkit': patch
---

Browser test files that never mount the app no longer load it, and the engine module starts loading when vitest starts, so the first tests of a run do not wait for it.
