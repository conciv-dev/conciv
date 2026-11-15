---
'@conciv/core': patch
'@conciv/chat': patch
---

Deleting a session stops its run first: a live run, a turn still waiting in a plugin's prompt hook and a running `experimental.idle` hook end before anything of the session is removed, so plugins hear `session.deleted` last.
