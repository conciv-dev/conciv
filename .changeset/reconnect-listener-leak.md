---
'@conciv/contract': patch
---

Fix a JS event listener leak in the browser RPC websocket's reconnect path: partysocket's `ReconnectingWebSocket` registers a dangling `error` listener on each discarded socket during its internal auto-reconnect loop and never removes it, so a persistently unreachable engine accumulated listeners without bound. The websocket now makes a single bounded connection attempt per cycle and reconnection is driven externally with capped exponential backoff, cutting the per-outage reconnect rate (and the leak with it) by more than an order of magnitude while preserving automatic recovery once the engine comes back.
