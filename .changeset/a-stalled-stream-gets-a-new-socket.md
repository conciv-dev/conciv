---
'@conciv/backend-plugin-api': patch
'@conciv/protocol': patch
---

An event stream that goes silent for 45 s on a socket that stays open (the machine slept, a NAT dropped the connection) now comes back: the widget's socket is reconnected once for that stall, and the stream resubscribes over the new socket and sees `server.connected` again. Before, the new subscribe waited on the dead socket until the browser dropped it. The stall abort reason is now `DOMException('Event stream stalled', 'TimeoutError')`.

`Conciv.make(raw, {idleTimeout})` takes an optional idle timeout in milliseconds (default 45000), as opencode's `createClientConnection` does.
