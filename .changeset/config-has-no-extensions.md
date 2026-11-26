---
'@conciv/types': patch
---

The conciv config has no `extensions` field: nothing loads extension packages any more, and plugins, from `plugins` or `conciv/plugins`, replace them. `@conciv/extension-compiler` and the private `@conciv/extension-testkit` are deleted; `@conciv/extension-compiler` is no longer published. Plugin tests use `@conciv/plugin-testkit`.
