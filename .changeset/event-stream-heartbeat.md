---
'@conciv/backend': patch
'@conciv/backend-plugin-api': patch
---

A plugin's event readers notice an event stream that went silent. The engine now sends a `server.heartbeat` frame on `event.subscribe` every 15 seconds, also under a `types` filter, as opencode's server sends its keepalive. The client counts it as activity and never hands it to a reader; when a stream sends nothing for 45 seconds, the client gives it up with "Event stream stalled", waits one second and subscribes again, so every reader sees `server.connected` again, its cue to resync. A raw `event.subscribe` reader sees the heartbeat frames.
