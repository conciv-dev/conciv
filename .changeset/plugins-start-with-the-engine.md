---
'@conciv/backend': patch
'@conciv/plugin-testkit': patch
---

Plugins now start while the engine starts, as opencode's instance does. The engine binds its port first and builds everything else after, so a request that arrives early (a CLI reads the port file as soon as it exists) waits until the engine is ready instead of failing, and is then answered normally. If the engine fails to build, those waiting requests fail at once (500), the port is released and the start error is reported. A page call made while plugins are still starting now waits for them instead of answering "unavailable".

For embedders of `makeApp`: `MadeApp.startPlugins()` is gone. Plugins start inside `makeApp`; `MadeApp.awaitActivation()` only waits for their first activation.
