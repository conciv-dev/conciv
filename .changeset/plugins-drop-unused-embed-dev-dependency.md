---
'@conciv/plugin-recorder': patch
'@conciv/plugin-test-runner': patch
'@conciv/plugin-try-it': patch
---

The recorder, test-runner and try-it plugins no longer list @conciv/app as a dev dependency they never import.
