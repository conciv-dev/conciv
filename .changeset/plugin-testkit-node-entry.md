---
'@conciv/backend-test-utils': patch
---

`@conciv/plugin-testkit/node` gives tests a `tmp` folder per test and an `engine` started in the same Node process once per file, built on the core kit and torn down after use.
