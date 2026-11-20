---
'@conciv/core': patch
---

Core reads its env values (CONCIV_STATE_ROOT, CONCIV_HARNESS, the session ids, CONCIV_HOME, PATH, HOME and the whole env for harness children and pty shells) as Effect Config through the engine's ConfigProvider. `start` and `makeApp` take an optional `configProvider` (default `ConfigProvider.fromEnv({preserveEmptyStrings: true})`), which also reaches the plugin host runtime; `resolveConfig` takes it as an optional third argument.
