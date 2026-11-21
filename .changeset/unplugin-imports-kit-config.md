---
'@conciv/unplugin': patch
---

In vitest, `conciv()` imports the test kit's config from `@conciv/plugin-testkit/vitest`, now an optional peer, instead of looking for the kit in the folders above the project. Without the kit installed it adds no projects; a kit that fails to load reports its own error.
