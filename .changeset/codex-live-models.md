---
'@conciv/harness': patch
---

Codex's model list and default model now come from codex's own catalog (`~/.codex/models_cache.json`, listed models in codex's priority order) and config (`model` in `~/.codex/config.toml`), instead of a hardcoded `gpt-5.5` that ChatGPT-account codex rejects. The static `@tanstack/ai-codex` list stays as the fallback when the catalog is missing or unreadable.
