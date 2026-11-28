---
'@conciv/cli': patch
'@conciv/plugin-test-runner': patch
---

`@conciv/cli/commands` exports the CLI's command tree, and `@conciv/plugin-test-runner/config` exports the schema of the plugin's options, so the docs site generates its CLI and test-runner reference from them.
