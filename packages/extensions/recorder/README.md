# @conciv/extension-recorder

## Overview

The package.json declares conditional exports: a browser entry (dist/client.js), a node import entry (dist/server.js), and explicit ./client and ./server subpaths. The build runs tsdown for src/server.ts, vite lib mode for src/client.tsx (solid, zod, @conciv/_, rrweb, rrweb-player, @rrweb/_, @tanstack/* and @orpc/* stay external, CSS is bundled), tsc for declarations only, and a second vite build that makes a test host into dist/test-host. Vitest runs two projects: 'recorder' in node for test/**/\*.test.ts and 'recorder-browser' in headless Chromium through Playwright for test/**/_.browser.test.tsx. UnoCSS uses presetConciv and scans src/\*\*/_.{ts,tsx}.

## Interface

- `exports` (`package.json`): '.' resolves to dist/client.js under the browser condition and to dist/server.js under import; './client', './server' and './package.json' are also exported
- `build` script (`package.json`): `tsdown && vite build && tsc -p tsconfig.build.json && vite build -c vite.test-host.config.ts`
- default export defineConfig (`tsdown.config.ts`): ESM build of entry src/server.ts with dts disabled
- default export defineConfig (`vite.config.ts`): lib build of src/client.tsx to client.js with emptyOutDir false and sourcemaps on
- default export defineConfig (`vite.test-host.config.ts`): calls `testHostConfig` from @conciv/extension-testkit/test-host with clientEntry src/client.tsx and outDir dist/test-host; test/helpers.ts references the test host
- default export defineConfig (`vitest.config.ts`): projects 'recorder' (node, 30s timeouts, test/fixtures excluded) and 'recorder-browser' (Chromium, 60s timeout, fileParallelism false)
- default export defineConfig (`uno.config.ts`): presetConciv with content src/**/*.{ts,tsx}
- `compilerOptions` (`tsconfig.build.json`): emitDeclarationOnly, outDir dist, rootDir src
- Subdirectories:
  - [src](./src/README.md): Entry points of the recorder extension. client.tsx defines the browser side (tools, attachment, Recorder view, capture Surface). server.ts defines the oRPC router and the server runtime (event rings, capture control, recording store, Chromium renderer).

## Invariants

- `peerDependencies` (`package.json`) requires solid-js ^1.9.13
- rollupOptions.external (`vite.config.ts`) never externalizes a source that contains '.css', so the inline CSS gets bundled
- `fileParallelism: false` (`vitest.config.ts`) makes browser test files run one at a time

## Side Effects

- `build` script (`package.json`) writes to dist/ and dist/test-host; emptyOutDir false (`vite.config.ts`) keeps the tsdown output in place
- the recorder-browser project (`vitest.config.ts`) launches headless Chromium through `playwright({})`

## Verification

- Run: `cd packages/extensions/recorder && pnpm test`
