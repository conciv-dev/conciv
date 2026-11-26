---
'@conciv/backend': patch
'@conciv/protocol': patch
---

A deleted session whose Claude Code or Codex transcript is still on disk no longer comes back the next time the session list loads. Opening it again, or going to it by its native id, answers "session not found", like any other deleted session, and the transcript file is left as it was. A native session that conciv has never seen still opens as before. Going to any deleted session by its conciv id answers "session not found" too, instead of handing the deleted session back.
