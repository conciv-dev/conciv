# @conciv/plugin

The conciv dev agent as an unplugin: vite (full: viteBridge + widget middleware + boot), webpack/rspack (boot the engine), rollup/esbuild (build-only no-ops). One factory, per-bundler subpath entries.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports` - `.`, `./vite`, `./webpack`, `./rspack`, `./rollup`, `./esbuild`, `./nextjs`, `./nextjs/widget`.
- Source: [src](./src/README.md).
- Test support: `test/fixtures/diagnostics-app/` (one compiling and one broken module for the diagnostics tests) and `test/helpers/` (temporary Vite dev servers for the plugin tests).

## Invariants

- webpack and rspack boot the engine only when `enabled !== false`; the Next.js widget starts only in a browser with `NEXT_PUBLIC_CONCIV_PORT` set and `NODE_ENV` not `production`. Full list in [src/README.md](./src/README.md#invariants).

## Side Effects

- The package root (configs and manifest) has none. At runtime the Vite, webpack and rspack entries boot the engine process (`src/core/boot.ts`), the Vite hook injects the widget tags into served HTML and writes `.conciv/extensions-client.gen.tsx`, and the Next.js widget entry mounts browser UI on `window`. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin` from the repo root (turbo builds the package and its dependencies first)
