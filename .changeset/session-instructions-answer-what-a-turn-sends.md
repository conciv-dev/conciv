---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
---

`sessions.instructions` answers exactly the system text a turn of the session sends now: the code-mode preface is included, and the `session.context` hooks see the turn's real options and offered tools instead of empty ones.
