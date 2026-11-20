---
'@conciv/plugin-testkit': patch
---

The happy-dom layer mounts the app through a `ws` proxy in the forked engine child, and its new `faults` fixture carries the same rpc faults as `/flow` plus `offline`, `online`, `pause` and `resume`. The rpc socket and its faults now take any source with a `routeWebSocket`, so a Playwright page and the proxy share one implementation.
