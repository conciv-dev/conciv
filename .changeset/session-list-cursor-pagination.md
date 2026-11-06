---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/protocol': patch
'@conciv/harness': patch
---

The session list is paged with a cursor. `sessions.list` takes `{cursor, limit}` and returns `{sessions, next}`, and each harness reads only the transcripts on the requested page instead of its newest 50. The new `sessions.get` returns one session. Codex, OpenCode and Pi now answer `meta` for a single session. A session whose native transcript is gone no longer appears in the list.
