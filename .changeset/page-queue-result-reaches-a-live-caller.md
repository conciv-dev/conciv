---
'@conciv/core': patch
'@conciv/protocol': patch
---

A finished page action queue no longer gets lost when a `page.queue.wait` caller goes away just as it finishes. A wait over `/rpc` or the rpc websocket now counts the result as delivered only once its reply has gone out (over `/rpc` the response finished writing; over the websocket the socket was still open when the call settled and the send was not skipped); otherwise the result stays owed and leads the next reply. The finished card shows in the chat once per queue, when it finishes, unless the result was already delivered or held for the next reply by then, and never again when a result goes back to owed.

Shape changes: `RpcContext` (`@conciv/protocol/rpc-types`) gains an optional `replied: Promise<boolean>`, and `rpcFetchMiddleware` and `rpcWebsocketRoute` (`@conciv/extension/rpc-mount`) now fill it for every call.
