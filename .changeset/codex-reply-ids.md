---
'@conciv/harness': patch
---

Keep every Codex reply. Codex numbers its items from `item_0` again on each turn, so a later reply reused the id of an earlier one: the chat showed it in place of the earlier reply and the saved thread dropped it. Message and tool call ids from Codex are now scoped to their run, and messages read from a Codex transcript carry the session id.
