---
'@conciv/unplugin': patch
'@conciv/plugin-testkit': patch
---

Loading `@conciv/unplugin` no longer loads `@conciv/core` or `@conciv/plugin`; the engine, the config resolver and the bundler bridge are imported when the dev server needs them, so a package that `@conciv/core` depends on can call `conciv()` in its own `vite.config.ts`. The testkit's node test project drops the `browser` and `solid` resolve conditions as the happy-dom project does, so a package with a top-level `solid()` plugin gets the Node build of its engine modules in node tests.
