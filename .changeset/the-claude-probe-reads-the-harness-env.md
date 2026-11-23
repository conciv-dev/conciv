---
'@conciv/harness': patch
---

The Claude probe takes `PATH`, `CLAUDE_CONFIG_DIR` and `ANTHROPIC_API_KEY` from the harness's config provider, over the process environment, so the claude it starts and the login it reads follow the harness's configuration.
