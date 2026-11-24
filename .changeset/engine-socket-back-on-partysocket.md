---
'@conciv/contract': patch
---

The browser's engine socket is a partysocket `ReconnectingWebSocket` again: partysocket owns the reconnect back-off and oRPC's `ClientRetryPlugin` the calls. `reconnect()` is called only once per single event (the next call after a revocation close, a user's Retry through `resetBrowserRpcConnection`), never from a timer or a retry schedule. `effect` is no longer a dependency of the contract.
