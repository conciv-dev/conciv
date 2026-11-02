---
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/client': patch
'@conciv/extension': patch
'@conciv/app': patch
---

Serve the sessions procedures as `conciv:sessions:*` hub functions beside oRPC, sharing one implementation, and publish the session list to the hub's `conciv:sessions` shared state after every sessions change. Publishes run one at a time so the last write is the latest list, and a chat turn publishes when it starts and when it ends so the running flag and title stay current. The widget calls the sessions group through the hub once it holds a trusted base, keeps the same query keys, and writes the published list into the sessions query. A browser hub client now connects to the engine it was given even after the page met another engine.
