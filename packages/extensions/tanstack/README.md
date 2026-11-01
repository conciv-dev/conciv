# @conciv/extension-tanstack

## Overview

package.json has two entry points. The browser condition and `./client` resolve to dist/client.js, which vite.config.ts builds from src/client.tsx. The import condition and `./server` resolve to dist/server.js, which tsdown.config.ts builds from src/server.ts. The build also emits declarations through tsconfig.build.json and builds a React test host with vite.test-host.config.ts. vitest.config.ts runs two projects: a node project for test/**/\*.test.ts and a headless Chromium project for test/**/*.browser.test.tsx.

## Interface

- `exports` (`package.json`): `.` (browser -> dist/client.js, import -> dist/server.js), `./client`, `./server`, `./package.json`
- `peerDependencies` (`package.json`): `@tanstack/react-router` >=1.170.0 and `solid-js` ^1.9.13
- `scripts.build` (`package.json`): runs `tsdown`, then `vite build`, then `tsc -p tsconfig.build.json`, then `vite build -c vite.test-host.config.ts`
- default export (`tsdown.config.ts`): ESM build of `src/server.ts` with `dts: false`
- default export (`vite.config.ts`): Solid lib build of `src/client.tsx` to `client.js`, with `solid-js`, `zod`, `@conciv/*` and `lucide-solid` kept external
- default export (`vite.test-host.config.ts`): `testHostConfig` over `test/host` with the React plugin, `clientEntry` set to dist/client.js, output to dist/test-host, and `virtual:conciv-connect-probe` aliased to test/host/conciv/extensions/connect-probe.tsx
- default export (`vitest.config.ts`): projects `tanstack` (node, 120s timeouts) and `tanstack-browser` (Playwright Chromium, headless, `fileParallelism: false`, 60s timeout)
- default export (`uno.config.ts`): UnoCSS with `presetConciv`, scanning src/**/*.{ts,tsx}
- Subdirectories:
  - [src](./src/README.md): Holds the client and server entry points of the tanstack extension, each built with `defineExtension` under the name `tanstack`.

## Invariants

- `external` (`vite.config.ts`): any import matching /^solid-js/, /^zod/, /^@conciv\//, /^lucide-solid/ is left out of the client bundle
- `exclude` (`vitest.config.ts`): the node project skips test/host/**, _.browser.test.tsx and dist/_*
- `ignorePatterns` (`.oxlintrc.json`): lint skips test/fixtures/**

## Side Effects

- `scripts.build` (`package.json`): writes the build output to dist/, including dist/test-host

## Verification

- Run: `cd packages/extensions/tanstack && pnpm test`
