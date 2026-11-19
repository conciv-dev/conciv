---
'@conciv/plugin-ios': patch
---

A configured iOS plugin adds its rules for the native overlay and the served app to the system prompt of every model request, through the session `context` hook, as the old iOS extension's system prompt did. An unconfigured plugin adds nothing.
