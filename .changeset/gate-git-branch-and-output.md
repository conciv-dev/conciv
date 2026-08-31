---
'@conciv/core': patch
---

Close two read-only-classifier holes in the Bash approval gate: `git branch` now auto-allows only in list-shaped forms (creating, deleting, renaming, copying or repointing a branch asks), and any git segment carrying `--output` asks because it writes a file.
