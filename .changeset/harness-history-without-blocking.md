---
'@conciv/types': patch
'@conciv/harness': patch
'@conciv/backend-defaults': patch
'@conciv/backend': patch
---

Harness transcripts, session folders, model caches and the Claude plugin folder are read without blocking, and the context token count streams the transcript instead of reading it whole.
