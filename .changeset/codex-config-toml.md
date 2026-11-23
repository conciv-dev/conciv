---
'@conciv/harness': patch
---

The codex harness reads config.toml with a real TOML parser, so inline tables, dotted keys and quoted strings set the provider, model and login gate. A config.toml that does not parse is logged and treated as the default OpenAI provider.
