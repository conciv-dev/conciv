---
'@conciv/plugin': patch
'@conciv/embed': patch
'@conciv/plugin-recorder': patch
'@conciv/plugin-page': patch
---

A plugin reads engine data through the server's `data` (synced by the host from the app's own query cache) and its own rpc through the SDK query and mutation options, never through hand-built queries.
