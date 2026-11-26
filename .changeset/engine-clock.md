---
'@conciv/backend': patch
'@conciv/plugin-page': patch
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

The engine takes a clock: `start` and `makeApp` accept a `clock` layer provided under the whole plugin host, and the event heartbeat, the page source-map fetch and queued page plays run on it. The test kits gain `clock: 'test'` with `engine.clock.advance(call)` and `engine.clock.drain()`, opencode's stepped test clock.
