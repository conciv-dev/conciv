---
'@conciv/types': patch
'@conciv/harness': patch
---

`HarnessHistory.observe` is removed, with the transcript handle types it returned (`TranscriptHandle`, `TranscriptChunk`, `TranscriptRevision`, `TranscriptFailure`, `TranscriptFailureReason`, `TRANSCRIPT_FAILURES`) and the shared `makeJsonlHandle` reader the adapters built it on. No product code read it; a session's history is read through `messages` and `tail`.
