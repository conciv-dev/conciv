---
'@conciv/core': patch
'@conciv/ai': patch
'@conciv/chat': patch
---

A session's lastActive and title now follow its conciv chat: every saved chat message (chat turns, hub tool calls, imported transcript messages) moves the session's updated time forward to that message's own time (an imported transcript keeps the time its messages were written, not when the session was opened), a failure to record it is logged and never loses the saved messages, and the first user message titles a session that has no title yet, so they stay right after the harness transcript is cleaned up. A one-time migration repairs existing rows from their stored messages.
