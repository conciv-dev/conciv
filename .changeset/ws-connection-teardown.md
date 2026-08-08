---
'@conciv/contract': patch
'@conciv/embed': patch
---

Closing a browser rpc connection no longer raises an unhandled error.

A disposed connection now answers writes itself instead of letting them reach a dead socket: peer
control frames (cancellations and client event-iterator payloads) are dropped, so oRPC's abort path
runs to completion and closes the call it was cancelling, while a request frame still fails fast so a
caller holding a stale link learns the connection is gone instead of hanging. Dispose delivers a
close event only when partysocket's own `close()` emits none — it already dispatches one
synchronously unless the socket never dialled or is already closing — so the peer observes exactly
one terminal event.

Unmounting the widget now releases the tab's connection: the socket is closed and the registry entry
dropped, instead of leaving partysocket and its reconnect timers alive for the rest of the tab's
life. A later mount re-creates the connection through the same registry, running the full transport
probe again.

`handle.rebind` now drops the old connection before tearing its consumers down, and rebinding to the
base the widget is already on re-runs the probe rather than being a no-op, so a tab that fell back to
fetch/SSE while the engine was unreachable can ride the websocket again once it recovers.

A live connection reports partysocket's real state: open while open, connecting while it will
reconnect, closed once it will not, so oRPC fails a send fast instead of waiting on a socket that is
never coming back.
