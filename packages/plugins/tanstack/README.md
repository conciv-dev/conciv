# @conciv/plugin-tanstack

The conciv TanStack plugin, engine part. It reads the dev server's build errors, the app's route manifest from
`src/routeTree.gen.ts` and recent server-function calls, and gives the agent three code-mode tools and one skill.

```ts
plugins: ['@conciv/plugin-tanstack']
```

Option: `bundlerWaitMs` (default `10000`), how long `build_errors` waits for the engine to say whether a dev server is
attached before it fails with `BUNDLER_UNAVAILABLE`: `plugins: [['@conciv/plugin-tanstack', {bundlerWaitMs: 5000}]]`. A
value that is not a positive integer fails the plugin's activation with `Tanstack.InvalidOptions`.

- Tools: `external_tanstack_build_errors()`, `external_tanstack_route_manifest()`,
  `external_tanstack_server_fn_trace({count?})`. Failures carry `metadata.code`: `BUNDLER_UNAVAILABLE` when the engine
  has no bundler bridge, `MANIFEST_UNREADABLE` when the generated route tree cannot be read.
- Skill: `tanstack`, how to use the tools.
- From a terminal, on the running engine:
  - `conciv plugin call experimental.tanstack buildErrors` prints the same build errors; without a
    bundler bridge it prints the `bundler bridge unavailable` failure.
  - `conciv plugin call experimental.tanstack routeManifest` prints every route; when the generated
    route tree cannot be read it prints why.
  - `conciv plugin call experimental.tanstack serverFnTrace --data '{}'` prints the recent server-function calls and
    every server function seen; `--data '{"count":5}'` keeps the latest five calls.
- `./rpc`: the schemas `FrameworkInfo`, `RouterCurrent`, `RouteNode`, `CacheEntry` and `AppError`, and `Definition`,
  the RPC `experimental.tanstack` other plugins call.
- `./client`: `tanstackToolMeta(name)`, the label, icon and summary the thread shows for each TanStack tool; data only,
  no Solid.
- `plugin-experimental.tsx`: besides the page operations and the inspector chip, it adds the thread card for each
  TanStack tool, drawn only through `ctx.ui` (conciv's own members read with `OpaqueUi.toInternal`); it imports no kit.
