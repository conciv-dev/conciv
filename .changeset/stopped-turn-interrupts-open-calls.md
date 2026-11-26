---
'@conciv/backend': patch
---

A turn stopped while a tool call is still open saves a failed result "Tool execution interrupted" for that call and sends it to anyone following the run, so the card stops running and its question can no longer be answered.
