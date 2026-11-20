---
'@conciv/harness-testkit': patch
---

A `./node` entry gives harness tests vitest `test.extend` fixtures: a scripted chat (reply, hold, release, everything released at teardown), a fake CLI, a temp folder, the fake harness and the booted kit. A test's config values go in the `env` option and reach the engine as an Effect `ConfigProvider` (`BootEnv.configProvider`), with the fake CLI folder first on its `PATH`; the kit never reads or writes `process.env`.
