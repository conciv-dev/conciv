---
'@conciv/harness-init': patch
---

`claudeInit.installed` reads `CLAUDE_CONFIG_DIR` as Effect Config under the project's optional `configProvider` (default `ConfigProvider.fromEnv({preserveEmptyStrings: true})`). The hub's agent CLI child runs with the env given to `makeChildRun(env)`; core passes the whole env it read from its ConfigProvider, and the default runner lets the child inherit the process env.
