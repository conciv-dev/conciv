---
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/extension': patch
'@conciv/protocol': patch
'@conciv/client': patch
---

Every browser oRPC call now rides one reconnecting WebSocket per engine (`/rpc-ws`) instead of HTTP. The socket reconnects on its own, open streams such as `sessions.changes` resubscribe after an engine restart or a laptop sleep, and reachability follows the socket's open and close. Trust is per connection: a socket serves only the login procedures until its first trust frame or auth call trusts it, and a revoked token closes the socket and stops it reconnecting. The HTTP `/rpc` handler stays for node clients.
