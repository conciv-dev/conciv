---
'@conciv/db': patch
'@conciv/harness-init': patch
'@conciv/core': patch
'@conciv/cli': patch
---

The conciv home folder and its database files are checked and made private without blocking, once, before the home database opens.
