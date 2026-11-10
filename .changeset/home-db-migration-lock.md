---
'@conciv/db': patch
---

Opening the conciv home db from two processes at once no longer fails: migrations run one opener at a time under a `home.lock` file.
