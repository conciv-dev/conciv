---
'@conciv/plugin-testkit': patch
---

The kit's vitest config no longer loads the engine to build its projects: it imports the engine only when a browser-mode test starts one, which cuts up to a second from the start of every test run.
