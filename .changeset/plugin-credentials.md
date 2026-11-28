---
'@conciv/backend-plugin-api': patch
'@conciv/backend-app-api': patch
'@conciv/backend-defaults': patch
'@conciv/protocol': patch
'@conciv/errors': patch
'@conciv/client': patch
---

A plugin can declare an integration and read its secret without the secret ever reaching the browser. Inside its `effect` (or `setup` on the promise entry) a plugin registers integrations and their sign-in methods (`oauth`, `command`, `key`, `external`, `env`) with `ctx.integration.transform`, and reads the active connection's value with `ctx.integration.connection.active` and `ctx.integration.connection.resolve`; an expiring oauth token refreshes once however many callers ask, and `ctx.credential.activate` picks which stored credential an integration uses. Credentials are stored per user in the engine's database. Every secret (a key, an oauth access and refresh token) is an Effect `Redacted` in the engine and the plugin API, so logs, tool output, events and rpc answers show `<redacted>`; only the credential table holds the plain value. The engine's rpc gains `credential.*` (list, create, update, activate, remove), `integration.*` (list, get, connect a key or an external credential, the oauth and command sign-in attempts) and `experimental.integration.wellknown.add`, which adds a well-known origin whose manifest names a `login` command.
