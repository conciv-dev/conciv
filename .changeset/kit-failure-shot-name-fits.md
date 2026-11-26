---
'@conciv/app': patch
---

A failed browser test's screenshot is saved even when the test's full name is longer than the file system allows: the kit takes the shot itself, before cleanup, into `.vitest/attachments/failure-screenshots/<file>/`, with the name cut at 200 characters plus the test id.
