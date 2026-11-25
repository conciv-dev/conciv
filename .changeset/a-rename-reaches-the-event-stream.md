---
'@conciv/backend': patch
'@conciv/backend-plugin-api': patch
---

The engine publishes `session.renamed` on every rename, as opencode, and `ConcivEvent` carries it; a plugin or an event stream reader now hears a session's new title.
