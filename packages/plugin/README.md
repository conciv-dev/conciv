# @conciv/plugin

The conciv dev agent as an unplugin: vite (full: viteBridge + widget middleware + boot), webpack/rspack (boot the engine), rollup/esbuild (build-only no-ops). One factory, per-bundler subpath entries.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports` - `.`, `./vite`, `./webpack`, `./rspack`, `./rollup`, `./esbuild`, `./nextjs`, `./nextjs/widget`.
- Source: [src](./src/README.md).
- Test support: `test/fixtures/diagnostics-app/` (one compiling and one broken module for the diagnostics tests) and `test/helpers/` (temporary Vite dev servers for the plugin tests).

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `cd packages/plugin && pnpm test`
