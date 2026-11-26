---
'@conciv/backend': patch
'@conciv/cli': patch
'@conciv/protocol': patch
'@conciv/types': patch
'@conciv/serve': patch
'@conciv/simulation': patch
'@conciv/plugin-try-it': patch
'@conciv/try': patch
'@conciv/backend-plugin-api': patch
'@conciv/app': patch
---

The engine token now travels one way only: as `?conciv_auth_token=<token>` on the connect URL, checked once at connect like Devframe's static tokens. Every plain HTTP request carries it on its own URL; the rpc socket reads it from its upgrade URL when it opens, and the engine token then trusts that socket for its life. The `/t/<token>` path prefix and the `Authorization: Bearer` header are gone. The MCP url the engine hands its harnesses is `<origin>/api/mcp?conciv_auth_token=<token>`; the conciv home db keeps each engine's bare origin and its token in separate columns, and `makeRpcClient(apiBase, {token})` and `makeBrowserRpcClient(apiBase, {token})` put the token on the URL.

A plugin server entry's `http.password` is now the server's credential: the widget connects to `http.url` with it as the engine token. The try-it plugin hands its pairing token that way, and its probe keeps only the engine that token opens.
