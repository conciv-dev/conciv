---
'@conciv/backend-plugin-api': patch
---

A plugin's event readers keep receiving after the event stream ends. Before, a stream that ended for a reason the connection does not retry (the engine refused the subscription or its event feed overflowed) ended `client.event.subscribe` and `rpc(Definition).events.on` for good, and the widget's plugin list stopped hearing about plugin changes. Now the client subscribes again one second later, as opencode's client connection does, and every reader stays attached and sees `server.connected` again, its cue to resync. Events published while the stream was away are not replayed. A reader that falls 4096 events behind still fails, as before. A handler passed to `events.on` that throws is logged and keeps receiving the next events; before, it stopped receiving.
