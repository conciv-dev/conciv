---
'@conciv/app': patch
---

The old `@conciv/extension-test-runner` package is removed. Use `@conciv/plugin-test-runner` instead: load it with
`plugins: [['@conciv/plugin-test-runner', {runner: 'playwright'}]]`. The runner is the plugin's `runner` option
(vitest by default, or playwright).
