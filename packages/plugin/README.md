# @conciv/plugin

The conciv plugin SDK, a port of opencode's plugin package: `Plugin.define` for a plugin's engine part and browser
part, RPC contracts between the two, registries and stores. Nothing in conciv uses it yet.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

| Entry                                 | What it is                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@conciv/plugin`                      | The engine part: `Plugin.define({id, setup})`, its `Context`, and the `Tool`, `Skill`, `Model`, `Location` and `Rpc` namespaces                           |
| `@conciv/plugin/rpc`                  | `Rpc.define({id, methods, events})`: the contract both parts import                                                                                       |
| `@conciv/plugin/experimental`         | The browser part: `Plugin.define({stores, setup})`, registries, `Store`, `Contract`, `Registry`, `createKeyed`, `createLatest`, `usePlugin`, `bindPlugin` |
| `@conciv/plugin/experimental/vite`    | `experimental()`: builds a browser part into its `./plugin-experimental` bundle                                                                           |
| `@conciv/plugin/experimental/builtin` | First-party tier (`ToolCall`, `onIdle`), never for outside plugins                                                                                        |
| `@conciv/plugin/host`                 | Engine-side host only: finds a plugin's entry files                                                                                                       |
| `@conciv/plugin/experimental/host`    | Browser-side host only: `compose`, enable rules, the bundle evaluator                                                                                     |

- Source, examples and every difference from opencode: [src](./src/README.md).

## Invariants

- ESM only (`type: module`); `solid-js` is a peer, `vite` and `vite-plugin-solid` are optional peers (only
  `./experimental/vite` needs them).

## Side Effects

- None at import. `./host` reads plugin folders and imports their entry files when the host calls it.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin` from the repo root (turbo builds the package and its
  dependencies first)
