---
'@conciv/backend': patch
---

A chat turn finds the message it is sending by reading that one message, not the whole conversation, so a long conversation no longer slows each send.
