# @conciv/plugin-tanstack

The conciv TanStack plugin, engine part. It reads the dev server's build errors, the app's route manifest from
`src/routeTree.gen.ts` and recent server-function calls, and gives the agent three code-mode tools and one skill.

```ts
plugins: ['@conciv/plugin-tanstack']
```

- Tools: `external_tanstack_build_errors()`, `external_tanstack_route_manifest()`,
  `external_tanstack_server_fn_trace({count?})`. Failures carry `metadata.code`: `BUNDLER_UNAVAILABLE` when the engine
  has no bundler bridge, `MANIFEST_UNREADABLE` when the generated route tree cannot be read.
- Skill: `tanstack`, how to use the tools.
- From a terminal, on the running engine: `conciv plugin call experimental.tanstack buildErrors --data '{}'` prints
  the same build errors; without a bundler bridge it prints the `bundler bridge unavailable` failure.
- `./rpc`: the schemas `FrameworkInfo`, `RouterCurrent`, `RouteNode`, `CacheEntry` and `AppError`, and `Definition`,
  the RPC `experimental.tanstack` other plugins call.
