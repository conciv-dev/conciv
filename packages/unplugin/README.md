# @conciv/unplugin

The conciv dev agent as an unplugin: vite (full: viteBridge + widget middleware + boot), webpack/rspack (boot the engine and add the widget entry in dev builds), rollup/esbuild (build-only no-ops). One factory, per-bundler subpath entries.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports` - `.`, `./vite`, `./webpack`, `./rspack`, `./rollup`, `./esbuild`, `./nextjs`, `./nextjs/widget`.
- Source: [src](./src/README.md).
- Test support: `test/fixtures/diagnostics-app/` (the compiling module for the diagnostics tests; the test writes the broken one into its temp copy) and `test/helpers/` (temporary Vite dev servers for the plugin tests). An engine these tests boot offers every agent CLI found on its own process `PATH` (`detectedHarnesses` in `packages/core/src/app.ts`), and no conciv config option fixes that set, so the tests run with whatever harness CLIs the machine has installed.

## Invariants

- webpack and rspack add the widget entry and boot the engine only when `enabled !== false` and `mode` is not `production` (an unset `mode` counts as `production`; `development` and `none` get both), the engine only while the bundler watches; a taken `port` logs one line and leaves the bundler running; the Next.js widget starts only in a browser with `NEXT_PUBLIC_CONCIV_PORT` set and `NODE_ENV` not `production`. Full list in [src/README.md](./src/README.md#invariants).
- Vite (not in middleware mode, where the user's own script owns the process): Ctrl+C, and SIGHUP when a terminal is attached, is sent on as SIGTERM, so Vite's own close runs every plugin's `closeServer` and conciv's stops the engine, which ends the live runs with their adapter cleanup and their agent CLI, then exits (143). Opencode's shutdown deadline (`src/core/shutdown-deadline.ts`, from opencode `packages/cli/src/shutdown-deadline.ts`) bounds that close: past 10 s, or on a second Ctrl+C, it prints what is still pending and exits 1. Its listeners go in `closeServer` unless a shutdown has started.
- Next.js: `register()` keeps no engine handle and Next's worker has no close hook, so Ctrl+C on `next dev` never stops the engine and a live run's adapter files can stay in the project. The agent CLI is killed by `@conciv/ai`'s exit hook when the worker exits through its own `process.exit`; when `next dev` SIGKILLs the worker first (`NEXT_EXIT_TIMEOUT_MS`, 100 ms by default) no code runs and the CLI can outlive it. A larger `NEXT_EXIT_TIMEOUT_MS` gives the worker time to exit itself.

## Side Effects

- The package root (configs and manifest) has none. At runtime the Vite, webpack and rspack entries boot the engine process (`src/core/boot.ts`), the Vite hook injects the widget tags into served HTML, the webpack and rspack hooks write `.conciv/widget-client.<port>.gen.js` in a development build, and the Next.js widget entry mounts browser UI on `window`. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/unplugin` from the repo root (turbo builds the package and its dependencies first): `src/core/shutdown-deadline.test.ts` (the deadline and the second Ctrl+C, in a child process) and `src/core/vite.test.ts` (a real `vite` dev server with the plugin and a fake `claude` on its PATH gets Ctrl+C mid-run; afterwards no adapter file is in the project and the CLI is gone)
