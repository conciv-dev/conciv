---
'@conciv/harness': patch
---

A Codex whose `config.toml` selects a provider that does not use the stored OpenAI login (a `model_provider` other than `openai` whose `[model_providers.<id>]` table does not set `requires_openai_auth = true`) is no longer refused a turn because `codex login status` says not logged in.
