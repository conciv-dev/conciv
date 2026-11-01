# @conciv/extension-try-it

## Overview

Package root of `@conciv/extension-try-it` (private, not published). It holds the build configs: `vite.config.ts` bundles `src/client.tsx` into `dist/client.js`, `vite.test-host.config.ts` builds a test host from the connect-pane fixture, and `vitest.config.ts` runs a node project and a Chromium browser project with a local health server as global setup.

## Interface

- `./client` export (`package.json`): `dist/client.js`, built from `src/client.tsx`
- `vite.config.ts`: library build of `src/client.tsx` with `solid-js`, `zod`, `@conciv/*` and `lucide-solid` external
- `vite.test-host.config.ts`: `testHostConfig` build of `test/fixture/connect-pane-fixture.tsx` into `dist/test-host`
- `vitest.config.ts`: projects `try-it` (node, `test/**/*.test.ts`) and `try-it-browser` (Chromium, `test/**/*.browser.test.tsx`), `globalSetup` `test/health-server.global.ts`
- `uno.config.ts`: UnoCSS with `presetConciv` over `src/**/*.{ts,tsx}`
- Subdirectories:
  - [src](./src/README.md): Client entry `tryIt(config)` that defines the `try-it` extension with a connect gate and a connect-slot pane.

## Invariants

- `private: true` (`package.json`): the package is never published
- `emptyOutDir: false` (`vite.config.ts`): the client build does not wipe `dist`, so the `tsc` declarations and the test-host build share it

## Side Effects

- `test/health-server.global.ts` (referenced from `vitest.config.ts`) binds an HTTP server on `127.0.0.1:CONNECT_LAST_PORT` for the test run

## Verification

- Run: `cd packages/extensions/try-it && pnpm test`
