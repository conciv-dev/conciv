---
'@conciv/app': patch
---

The reader that forgets sessions deleted on the engine is an Effect program: it waits for a bound engine, streams the engine's events, and stops by interruption when the app is disposed.
