---
'@conciv/core': patch
'@conciv/protocol': patch
'@conciv/extension': patch
---

A finished page action queue no longer gets lost when the caller that asked for it goes away just as it finishes. A `page.queue.wait` over `/rpc` or the rpc websocket, a `code.execute` over oRPC, and a hub call over `/api/mcp` now count the result as delivered only once their reply has actually gone out; otherwise the result stays owed and leads the next reply. The finished card shows in the chat once per queue, when it finishes, never again when a result goes back to owed.

Shape changes: `RpcContext` (`@conciv/protocol/rpc-types`) gains an optional `replied: Promise<boolean>`, and `rpcFetchMiddleware` and `rpcWebsocketRoute` (`@conciv/extension/rpc-mount`) now fill it for every call.
