---
'@conciv/plugin': patch
---

A plugin's event readers keep receiving after the event stream ends. Before, a stream that ended for a reason the connection does not retry (the engine refused the subscription or its event feed overflowed) ended `client.event.subscribe` and `rpc(Definition).events.on` for good, and a reader that fell 4096 events behind failed. Now the shared event stream opens a new subscription one second later, as opencode's client connection does, and every reader stays attached and sees `server.connected` again, its cue to resync. A reader that falls 4096 events behind drops what it had queued and gets the last `server.connected` instead of failing. Events published while a reader was away are not replayed. A handler passed to `events.on` that throws is logged and keeps receiving the next events; before, it stopped receiving.
