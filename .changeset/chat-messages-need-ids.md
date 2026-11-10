---
'@conciv/ai': patch
---

The chat server refuses an incoming chat message without an id, on the HTTP and WebSocket chat endpoints and on a server-driven turn, instead of storing it twice.
