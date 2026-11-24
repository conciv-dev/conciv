---
'@conciv/contract': patch
'@conciv/app': patch
---

The browser's engine socket is a partysocket `ReconnectingWebSocket` again: partysocket owns the reconnect back-off, oRPC's `ClientRetryPlugin` the calls, and the contract never calls `reconnect()` itself. `resetBrowserRpcConnection` is gone, and Retry on the unreachable notice and the error screens re-checks the login while the socket comes back on its own. A socket closed for a revoked login reconnects like any other, as an untrusted socket. `effect` is no longer a dependency of the contract.
