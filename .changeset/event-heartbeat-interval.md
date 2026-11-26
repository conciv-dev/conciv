---
'@conciv/backend': patch
---

The engine's event stream heartbeat interval is now settable: `makeApp` takes an optional `eventHeartbeatIntervalMs` (default 15 000 ms, as before) for how often `event.subscribe` sends its `server.heartbeat` frame.
