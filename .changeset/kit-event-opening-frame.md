---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

`engine.event('server.connected')` is refused at once with a plain message instead of waiting until the engine stops: the engine sends that event only as the first frame of each event subscription, so a wait could never see one.
