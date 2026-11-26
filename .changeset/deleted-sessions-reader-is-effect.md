---
'@internal/frontend-defaults': patch
---

The reader that forgets sessions deleted on the engine is an Effect program: it waits for a bound engine, streams the engine's events, and stops by interruption when the app is disposed. Disposing it aborts its event subscription through a signal, so a subscription waiting for its next event ends at once, and a failure that arrives together with the interruption is still logged.
