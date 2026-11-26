---
'@conciv/backend': patch
'@conciv/backend-defaults': patch
'@conciv/types': patch
'@conciv/protocol': patch
'@conciv/app': patch
---

A message sent to a deleted session is refused before anything of it is kept: the send ends with the error `session "<id>" does not exist`, with no run, no stored message and nothing published on the session's stream. A page queue follow-up or a compaction of a deleted session is refused with that same error and starts no run; a refused compaction writes no compaction marker. A call from outside a run that is admitted per session (an MCP client's `code.execute` while hub access is not `open`) is refused for a deleted session as for one that does not exist. Opening a deleted session no longer moves its last-active time. A message sent to an id no session ever had still starts that session.

If you implement `TurnHooks` yourself, add `admit: async (turn) => {}`. It runs before anything of the turn is stored, and a rejection refuses the turn with that error. If you build a `SessionPort` yourself, its `row` now returns `deletedAt` too: `null` for a live session, the time it was deleted otherwise.

A turn or compaction refused because its session is deleted carries the code `SESSION_DELETED_CODE` (`'session_deleted'`, exported from `@conciv/types/chat-event-types` beside `CONTEXT_OVERFLOW_CODE`): on the `RUN_ERROR` frame and on the client's `Error.code`, so a client can tell a deleted session from any other failure.

The RPC `sessions.compact` now declares the contract's `NOT_FOUND` error and answers it for a session that does not exist or is deleted, where it answered an internal server error before.

With hub access `open`, an outside call (an MCP client's `code.execute` or a hub `registry.call`) on a deleted session is refused with `session "<id>" does not exist` too: it no longer runs, and nothing of it is recorded in the deleted session's chat.

Opening a deleted session no longer imports its harness transcript into its thread: the history of a deleted session stays as the delete left it.

In the widget, a deleted session shows a panel in place of the chat and composer: 'This session was deleted.' and one 'New session' button, also when the delete arrives while the pane is open. A delete that lands while the widget's event stream is not connected is picked up when the stream connects. A message refused because its session was deleted reads 'This session was deleted, so your message was not sent.' in the thread and in a notice, with no Retry, and the pane then turns into that panel. When the deleted session had saved text the panel adds 'Your text moves to the new session.', and 'New session' moves that text (not its attachments) into the new session. In the quick terminal the new session takes the deleted pane's place. Compacting a session that is deleted or does not exist says 'This session no longer exists.'. When a new session cannot be started, from any new-session action, a notice says 'Could not start a new session. Check that the engine is running, then try again.'
