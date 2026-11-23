---
'@conciv/plugin': patch
'@conciv/embed': patch
'@conciv/plugin-recorder': patch
'@conciv/plugin-page': patch
---

A plugin reads engine data through its server's `data`: `server.data.meta.models(sessionId)` returns the app's own query for the session's models (same key and cache as the model picker). Plugin rpc reads and writes go through the SDK query and mutation options, never through hand-built queries.
