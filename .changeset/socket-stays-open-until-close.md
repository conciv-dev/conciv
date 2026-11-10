---
'@conciv/contract': patch
---

The browser transport sends its oRPC frames through its own peer client and drops an abort frame for a socket that is not open, so cancelling a call while the socket closes no longer leaves an unhandled "Cannot send message, WebSocket is not open." rejection. A request that cannot be sent still rejects its call, and a frame from the dev server that cannot be read is logged and fails the calls in flight instead of rejecting unhandled. A blocked or full localStorage keeps the engine token in memory; any other storage error is no longer swallowed. This replaces the pnpm patch on `@orpc/standard-server-peer`, which never reached npm consumers.
