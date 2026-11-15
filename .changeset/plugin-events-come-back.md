---
'@conciv/plugin': patch
---

A plugin's `rpc(Definition).events.on(name, handler)` keeps delivering after its event stream ends. Before, a stream that ended for a reason the connection does not retry (the engine refused the subscription, the engine's event feed overflowed, or the handler fell 4096 events behind) stopped the handler for good, with only a console error. Now `events.on` subscribes again one second later, as opencode's client connection does, and goes on with the events published from the new stream's `server.connected` on; events published while it was away are not replayed.
