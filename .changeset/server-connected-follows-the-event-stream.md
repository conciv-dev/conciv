---
'@conciv/plugin': patch
'@conciv/app': patch
---

A plugin's `ServerRef.connected` now says whether the event connection to the engine is up, as opencode's does: it goes false while the stream reopens and true again once `server.connected` arrives, so a plugin keyed on it attaches again after a reconnect. It used to follow the login. For implementers: `ConcivClient.connection` (`@conciv/plugin`) reads the client's event connection status, `status()` returning `'connecting' | 'connected' | 'reconnecting'` (type `ClientConnectionStatus`) and `on(listener)` returning its unsubscribe.
