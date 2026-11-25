---
'@conciv/app': patch
---

Deleting a session drops that session's Terminal model pick from this browser, as opencode does, so the saved picks no longer grow with every session ever used. The last model picked stays as the start for new sessions.
