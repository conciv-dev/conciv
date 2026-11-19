# @conciv/unplugin

The conciv dev agent as an unplugin: vite (full: viteBridge + widget middleware + boot), webpack/rspack (boot the engine and add the widget entry in dev builds), rollup/esbuild (build-only no-ops). One factory, per-bundler subpath entries.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports` - `.`, `./vite`, `./webpack`, `./rspack`, `./rollup`, `./esbuild`, `./nextjs`, `./nextjs/widget`.
- Source: [src](./src/README.md).
- Test support: `test/fixtures/diagnostics-app/` (the compiling module for the diagnostics tests; the test writes the broken one into its temp copy) and `test/helpers/` (temporary Vite dev servers for the plugin tests). An engine these tests boot offers every agent CLI found on its own process `PATH` (`detectedHarnesses` in `packages/core/src/app.ts`), and no conciv config option fixes that set, so the tests run with whatever harness CLIs the machine has installed.

## Invariants

- webpack and rspack add the widget entry and boot the engine only when `enabled !== false` and `mode` is not `production` (an unset `mode` counts as `production`; `development` and `none` get both), the engine only while the bundler watches; a taken `port` logs one line and leaves the bundler running; the Next.js widget starts only in a browser with `NEXT_PUBLIC_CONCIV_PORT` set and `NODE_ENV` not `production`. Full list in [src/README.md](./src/README.md#invariants).

## Side Effects

- The package root (configs and manifest) has none. At runtime the Vite, webpack and rspack entries boot the engine process (`src/core/boot.ts`), the Vite hook injects the widget tags into served HTML, the webpack and rspack hooks write `.conciv/widget-client.<port>.gen.js` in a development build, and the Next.js widget entry mounts browser UI on `window`. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/unplugin` from the repo root (turbo builds the package and its dependencies first)
