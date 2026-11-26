---
'@conciv/backend': patch
---

A plugin that creates a session with the id of a deleted session is now refused with the same "session not found" error it gets when it reads that session, and the deleted session stays deleted, so it can still be restored later. A plugin that creates a session with an id that was never used still gets a new session under that id.
