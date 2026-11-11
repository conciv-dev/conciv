---
'@conciv/protocol': patch
---

`SessionRecord` now carries the session row's `transcriptCwd`, `attachedPid` and `attachedAt`, so the type matches what the
sessions table stores.
