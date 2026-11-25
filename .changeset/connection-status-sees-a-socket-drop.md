---
'@conciv/backend-plugin-api': patch
'@internal/frontend-defaults': patch
---

A plugin's `ServerRef.connected` and `ConcivClient.connection` now go down when the engine's socket drops, even while other readers hold the event stream. The client opens the event stream without the transport's own retry, so a socket close ends the stream and the client's reconnect loop reads `'reconnecting'` and subscribes again every second, as opencode's does.
