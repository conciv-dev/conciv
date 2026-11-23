---
'@conciv/harness': patch
---

A Codex provider table header with a trailing comment, such as `[model_providers.gateway] # gateway`, is still read, so `requires_openai_auth = true` under it keeps the login check.
