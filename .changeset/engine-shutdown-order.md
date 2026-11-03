---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
---

Stopping the engine closes the listener first, then ends every live chat run as aborted, and only then closes the database, so a run or request during shutdown no longer hits a closed database.
