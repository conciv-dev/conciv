---
'@conciv/backend': patch
'@conciv/backend-defaults': patch
---

Deleting a session stops its run first: a live run, a turn still waiting in a plugin's prompt hook and a running `experimental.idle` hook end before anything of the session is removed, so plugins hear `session.deleted` last. Its page queue follow-up work is cancelled too: a follow-up in flight answers before the session is cleared and is not retried, and a queue result that lands after the delete starts no turn.
