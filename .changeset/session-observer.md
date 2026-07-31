---
'@conciv/session-observer': patch
---

One package now watches every session that runs outside conciv. `@conciv/session-observer` replaces `@conciv/session-presence`, which is deleted: it owns the presence states, the clock, writer attribution and the fan-out, and it never touches the filesystem itself.

Harnesses answer with a transcript handle instead of a file stat. `observe()` hands back `revision()`, which only asks how far the transcript has moved, and `read()`, which folds the bytes appended since the last read, so a long transcript is parsed once instead of on every poll. A transcript that is missing, unreadable or corrupt now surfaces as a typed failure instead of an empty message list, and `transcriptStat` is gone.

Sending into a session someone else is driving now has three answers instead of one: allowed, worth confirming, or blocked. Only a session that is actively working blocks, and a confirmed send always goes through, so the old dead-end dialog is gone.

Opening the connect picker reads each candidate transcript once per change rather than several times per poll: the facts behind each row are derived from a single pass and remembered against the transcript revision.
