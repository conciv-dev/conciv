---
'@conciv/backend': patch
---

The engine's Effect code logs through Effect and names its spans with the session id on them; a busy file system (too many open files) while making the plugin host's folders is retried instead of leaving the plugin host dead until restart.
