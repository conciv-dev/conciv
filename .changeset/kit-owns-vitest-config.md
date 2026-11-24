---
'@conciv/plugin-testkit': patch
'@conciv/harness-testkit': patch
---

`@conciv/plugin-testkit/vitest` exports `testProjects()`, the kit's three vitest projects, which now set their own timeouts, poll settings, pre-bundle list, worker cap and Testing Library cleanup. Neither kit needs `@internal/vitest-config` or `@conciv/tsconfig` any more: both are dev dependencies.
