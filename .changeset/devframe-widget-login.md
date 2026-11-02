---
'@conciv/cli': patch
'@conciv/core': patch
'@conciv/embed': patch
'@conciv/extension': patch
'@conciv/extension-compiler': patch
'@conciv/extension-recorder': patch
'@conciv/extension-terminal': patch
'@conciv/harness-init': patch
'@conciv/plugin': patch
'@conciv/skills': patch
---

The engine API now sits behind a login token. Agents and the CLI reach it under `/t/<token>` (the token is in `CONCIV_TOKEN` and in `.conciv/mcp-endpoint.json`). The widget asks once per browser to authorize itself against the dev server, then talks to the engine through the trusted base; no token ever appears in a browser URL.
