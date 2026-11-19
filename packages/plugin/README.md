# @conciv/plugin

The conciv plugin SDK, a port of opencode's plugin package: `Plugin.define` for a plugin's engine part and browser
part, RPC contracts between the two, registries and stores. Conciv's built-in plugins and the app's plugin host are
written against it.

Part of [conciv](https://github.com/conciv-dev/conciv).

- Source, examples and every difference from opencode: [src](./src/README.md).

## Invariants

- ESM only (`type: module`); `solid-js` is a peer, `vite` and `vite-plugin-solid` are optional peers (only
  `./experimental/vite` needs them).
- The browser part needs `Promise.try`: Chrome and Edge 128, Firefox 134, Safari and iOS Safari 18.2 (Node 23.0.0 for tooling that evaluates it), source MDN browser-compat-data (`javascript.builtins.Promise.try`).

## Side Effects

- None at import. `./host` reads plugin folders and imports their entry files when the host calls it.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin` from the repo root (turbo builds the package and its
  dependencies first)
