---
'@conciv/backend': patch
'@conciv/app': patch
---

A message sent right after Stop no longer vanishes. The history refresh that follows a stop (or a failed run, or joining a run) used to replace the thread with history fetched before the send, dropping the new message and its streamed reply. It now keeps every message added while the fetch was in flight, as opencode's client does.
