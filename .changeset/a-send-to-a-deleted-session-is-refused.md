---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
'@conciv/protocol': patch
---

A message sent to a deleted session is refused before anything of it is kept: the send ends with the error `session "<id>" does not exist`, with no run, no stored message and nothing published on the session's stream. A page queue follow-up or a compaction of a deleted session is refused with that same error and starts no run; a refused compaction writes no compaction marker. A call from outside a run that is admitted per session (an MCP client's `code.execute` while hub access is not `open`) is refused for a deleted session as for one that does not exist. Opening a deleted session no longer moves its last-active time. A message sent to an id no session ever had still starts that session.

If you implement `TurnHooks` yourself, add `admit: async (turn) => {}`. It runs before anything of the turn is stored, and a rejection refuses the turn with that error. If you build a `SessionPort` yourself, its `row` now returns `deletedAt` too: `null` for a live session, the time it was deleted otherwise.

A turn or compaction refused because its session is deleted carries the code `SESSION_DELETED_CODE` (`'session_deleted'`, exported from `@conciv/protocol/chat-event-types` beside `CONTEXT_OVERFLOW_CODE`): on the `RUN_ERROR` frame and on the client's `Error.code`, so a client can tell a deleted session from any other failure.
