---
'@conciv/backend-defaults': patch
'@conciv/errors': patch
---

A code-mode tool call stopped before it finished (the user pressed Stop, or an outside agent's request timed out while the call waited for approval) now says it was stopped, instead of "All fibers interrupted without error".
