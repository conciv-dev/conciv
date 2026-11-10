---
'@conciv/contract': patch
---

The browser transport sends its oRPC frames through its own peer client and drops an abort frame for a socket that is not open, so cancelling a call while the socket closes no longer leaves an unhandled "Cannot send message, WebSocket is not open." rejection. This replaces the pnpm patch on `@orpc/standard-server-peer`, which never reached npm consumers.
