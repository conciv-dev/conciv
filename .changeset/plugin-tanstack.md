---
'@conciv/plugin-tanstack': patch
---

New package `@conciv/plugin-tanstack`: the engine part of the TanStack inspector as a conciv plugin. Enable it with `plugins: ['@conciv/plugin-tanstack']`. The agent reads the dev server's build errors, the app's route manifest from `src/routeTree.gen.ts` and recent server-function calls from code mode as `external_tanstack_build_errors()`, `external_tanstack_route_manifest()` and `external_tanstack_server_fn_trace({count?})`, guided by the plugin's `tanstack` skill. `@conciv/extension-tanstack` is unchanged.
