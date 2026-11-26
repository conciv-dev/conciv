---
'@conciv/app': patch
---

`@conciv/plugin-testkit/vitest` exports `concivTest()`, the vite plugin that adds the kit's node, happy-dom and browser projects; `testProjects()` is no longer exported. The kit's timeouts, `expect.poll` and worker cap are defaults: a setting in the package's own `test: {...}` wins in all three projects, and the package's own `test.projects` are kept beside the kit's.
