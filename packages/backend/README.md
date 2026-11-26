# @conciv/backend

The shipped conciv engine: `start(opts)` runs `@conciv/backend-defaults`'
`createBackend` with the plugins conciv ships (the page plugin) and, when asked, the simulation. `@conciv/it` installs
it.

Part of [conciv](https://github.com/conciv-dev/conciv).

- Source: [src](./src/README.md).

## Invariants

- Exports `.` and `./start` (`package.json`), both `dist/start.js`; `src/start.ts` is the one tsdown entry.
- The plugin list lives in one place, `src/start.ts`; `@conciv/backend-test-utils` starts the same engine through
  `createBackend` without this package.

## Side Effects

- `build` (`package.json`): writes `dist/`.
