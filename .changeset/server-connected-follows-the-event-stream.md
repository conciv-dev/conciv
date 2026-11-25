---
'@conciv/backend-plugin-api': patch
'@internal/frontend-defaults': patch
---

A plugin's `ServerRef.connected` now says whether the event connection to the engine is up, as opencode's does: it goes false while the stream reopens and true again once `server.connected` arrives, so a plugin keyed on it attaches again after a reconnect. It used to follow the login. For implementers: `ConcivClient.connection` (`@conciv/backend-plugin-api`) reads the client's event connection status, `status()` returning `'connecting' | 'connected' | 'reconnecting'` (type `ClientConnectionStatus`) and `on(listener)` returning its unsubscribe.
