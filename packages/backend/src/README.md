# backend/src

## Purpose

The engine app, as Backstage's `packages/backend`: `start(opts)` (`start.ts`) calls `createBackend` from `@conciv/backend-defaults/backend` with the plugins it adds (`plugins: [page]`, `@conciv/plugin-page`) and, with `simulation: true`, the simulation starter (`lib/simulation.ts`, `@conciv/simulation/backend`). Ports, `server.json`, the dev endpoint and the home-db row are `createBackend`'s, so `@conciv/backend-test-utils` starts the same engine without this package.
