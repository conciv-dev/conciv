---
'@conciv/contract': patch
'@conciv/extension': patch
'@conciv/core': patch
---

Extensions and the app get persisted settings with Devframe's settings contract: `scope(namespace).settings.global` and `.project` on the server API, `getHostApi().useScope(namespace).settings` in the client, both backed by one JSON file per scope and namespace and kept in sync over the new `settings` procedures.
