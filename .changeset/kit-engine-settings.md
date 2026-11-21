---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

The test engine takes `policies`, `systemPrompt` and `sessionId`. A configured session id goes through core's own resolver, so an id that is not a conciv id is refused, and the engine opens on that session. Without them the engine keeps no policies, an empty system prompt and `'project'` hub access.
