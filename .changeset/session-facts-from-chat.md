---
'@conciv/core': patch
---

A session's lastActive and title now follow its conciv chat: every saved chat message (chat turns, hub tool calls, imported transcript messages) bumps the session's updated time, and the first user message titles a session that has no title yet, so they stay right after the harness transcript is cleaned up. A one-time migration repairs existing rows from their stored messages.
