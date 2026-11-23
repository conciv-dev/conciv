---
'@conciv/harness': patch
---

The Claude install check reads a relative PATH entry, such as `.` or `bin`, against the folder the CLI runs in, the way the spawn does.
