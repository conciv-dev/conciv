# backend/src

## Purpose

The engine app, as Backstage's `packages/backend`: `start(opts)` (`start.ts`) calls `createBackend` from `@conciv/backend-defaults/backend` with the plugins it adds (the page plugin's engine built-ins list, `@conciv/plugin-page/engine-builtins`) and, with `simulation: true`, the simulation starter (`startSimulation` from `@conciv/simulation/backend`, loaded on demand). Ports, `server.json`, the dev endpoint and the home-db row are `createBackend`'s, so `@conciv/backend-test-utils` starts the same engine without this package.
