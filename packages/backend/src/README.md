# backend/src

## Purpose

The engine app, as Backstage's `packages/backend`: `start(opts)` (`start.ts`) calls `createBackend` from `@conciv/backend-defaults/backend` with the built-in features it adds (`@conciv/plugin-page/engine`, the page plugin and its engine part) and, with `simulation: true`, the simulation starter (`startSimulation` from `@conciv/simulation/backend`, loaded on demand). Ports, `server.json`, the dev endpoint and the home-db row are `createBackend`'s, so `@conciv/backend-test-utils` starts the same engine without this package.
