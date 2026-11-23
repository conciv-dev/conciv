---
'@conciv/core': patch
'@conciv/plugin-page': patch
---

Deleting a session no longer asks the page plugin to cancel that session's queues first: the plugin already drops them when it hears `session.deleted`, and the engine's `queue.finished` listener already ignores a result of a deleted session. The page plugin's `queue.cancelSession` RPC method is gone.
