---
'@conciv/core': patch
---

Stop over-prompting on read-only shell work: a command auto-allows when every segment of a plain `&&`/`;`/`|` pipeline is a read-only command, and an approval can now be remembered for the exact command string for the rest of the session.
