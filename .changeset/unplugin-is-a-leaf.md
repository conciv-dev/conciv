---
'@conciv/unplugin': patch
'@conciv/plugin-testkit': patch
---

`@conciv/unplugin` is a leaf: its `build` is tsdown alone and waits for nothing, and its types come from a separate `build:types` step that waits for the packages whose types it reads. Loading the plugin no longer loads `@conciv/backend` or `@conciv/backend-plugin-api`; the engine, the config resolver and the bundler bridge are imported when the dev server needs them, so a package that `@conciv/backend` depends on can call `conciv()` in its own `vite.config.ts`. The testkit's node test project drops the `browser` and `solid` resolve conditions as the happy-dom project does, so a package with a top-level `solid()` plugin gets the Node build of its engine modules in node tests.
