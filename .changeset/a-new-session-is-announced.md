---
'@conciv/backend-plugin-api': patch
'@conciv/backend': patch
---

Plugins hear a new `session.created` event when a session comes to exist: on its first send, from `sessions.create` or a plugin's `ctx.session.create`, when a terminal or listed transcript first gets its conciv session, and for an outside agent's first call. It carries the session id and, when it has one, the title. A session that already existed, or a deleted one, publishes nothing.
