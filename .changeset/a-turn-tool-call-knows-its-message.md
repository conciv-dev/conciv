---
'@conciv/core': patch
'@conciv/protocol': patch
---

A plugin tool called inside a session turn gets the turn's assistant message id as `messageId` in its context, as in opencode, both when the model's tool loop runs it and when the session's own CLI calls it over MCP during the turn; a call from outside the turn (the hub, or no live run) gets none. Until the message id format is settled, an id that is not `msg_`-prefixed is left out.
