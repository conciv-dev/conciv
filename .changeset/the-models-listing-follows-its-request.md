---
'@conciv/core': patch
'@conciv/harness': patch
---

The models listing and the harness menu now follow their request's cancel signal, so a cancelled request stops its lookups. The shared Claude probe is no longer tied to the first caller's signal, so a cancelled request never ends a probe other callers wait on; it ends at its own 30 s bound. `codex login status` gets the same 30 s bound.
