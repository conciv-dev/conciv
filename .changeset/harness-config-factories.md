---
'@conciv/harness': patch
---

Harnesses are factories of an Effect ConfigProvider: `claude`, `codex`, `opencode` and `pi` read `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_DATA_HOME` and `PI_CODING_AGENT_DIR` as Effect Config when they run, and `harnessRegistry(provider)` replaces the module-level registry. Core builds the registry once per engine from its `configProvider`.
