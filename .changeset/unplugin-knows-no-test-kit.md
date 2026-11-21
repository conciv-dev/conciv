---
'@conciv/unplugin': patch
'@conciv/plugin-tanstack': patch
---

`conciv()` no longer knows the test kit: it has no dependency on `@conciv/plugin-testkit` and adds no test projects; in vitest it adds no config, starts no engine and stamps no JSX source. The tanstack plugin drops two development dependencies it never used, which closed the workspace's dependency loops, and the workspace now refuses a new loop at install (`disallowWorkspaceCycles`).
