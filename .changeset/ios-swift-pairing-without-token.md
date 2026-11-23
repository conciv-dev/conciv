---
'@conciv/plugin-ios': patch
---

The Swift SDK pairs with the engine without a token and loads the generic `/widget` page with a `launcher` query; the bridge handshake no longer carries a token, and the stale-token reload path is gone.
