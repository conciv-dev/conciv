---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
---

A message sent to a deleted session is refused before anything of it is kept: the send ends with the error `session "<id>" does not exist`, with no run, no stored message and nothing published on the session's stream. A page queue follow-up for a deleted session answers with that same error and starts no run. A message sent to an id no session ever had still starts that session.

If you implement `TurnHooks` yourself, add `admit: async (turn) => {}`. It runs before anything of the turn is stored, and a rejection refuses the turn with that error. If you build a `SessionPort` yourself, its `row` now returns `deletedAt` too: `null` for a live session, the time it was deleted otherwise.
