---
'@conciv/contract': patch
'@conciv/embed': patch
---

Closing a browser rpc connection no longer raises an unhandled error.

A disposed connection now answers writes itself instead of letting them reach a dead socket: peer
control frames (cancellations and client event-iterator payloads) are dropped, so oRPC's abort path
runs to completion and closes the call it was cancelling, while a request frame still fails fast so a
caller holding a stale link learns the connection is gone instead of hanging. Dispose also delivers
the close event through the socket's own event target before closing it, because partysocket emits no
close event while it is mid-backoff or already closed, which previously left the peer holding pending
calls forever.

`handle.rebind` now drops the old connection before tearing its consumers down, so the teardown order
is defined rather than racing oRPC's cancellation path.

Live connections are unchanged: a socket that is merely reconnecting still reports its real state and
buffers through partysocket, so recovery from a dropped connection behaves as before.
