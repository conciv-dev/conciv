---
'@conciv/plugin-ios': patch
'@conciv/core': patch
'@conciv/protocol': patch
'@conciv/unplugin': patch
---

The iOS pairing file moves into the ios plugin. An engine with `@conciv/plugin-ios` writes `~/.conciv/dev-endpoint.json` (`{apiBase, pid}`, no token) when it starts and removes it when it stops; core no longer writes it. `devEndpointDir` leaves the top-level conciv config and becomes an ios plugin option: `['@conciv/plugin-ios', {devEndpointDir}]`.
