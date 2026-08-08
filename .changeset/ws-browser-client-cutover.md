---
'@conciv/contract': patch
---

Browser rpc rides one websocket per (tab, apiBase).

`makeBrowserRpcClient`, `makeDeferredRpcClient`, `makeRebindableRpcClient` and the browser form of
`makeExtRpcClient` now resolve a shared connection from a versioned `globalThis` registry instead of
building a fetch link each. The connection picks its transport once, at boot, by dialling `/rpc-ws`
with a bounded open timeout and sticking to fetch/SSE when that fails; `widget.transport` pins either
transport explicitly. `makeRpcClient` stays on fetch for the CLI, testkit and node integration tests.

This removes the six-connection starvation that broke the widget from the third tab onwards.
