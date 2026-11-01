# @conciv/extension-terminal

## Overview

package.json exposes two entry points from conditional exports: browser `./dist/client.js` and node `./dist/server.js`. tsdown bundles `src/server.ts`, vite bundles `src/client.tsx` as an ES lib with solid-js/zod/@conciv/lucide-solid kept external, tsc emits declarations, and `vite.test-host.config.ts` builds a fixture host into `dist/test-host`. Vitest runs two projects: a node project (`terminal`, `test/**/*.test.ts`) and a Playwright chromium browser project (`terminal-browser`, `test/**/*.browser.test.tsx`). Both share the global setup `test/browser-server.global.ts`.

## Interface

- `exports` (`package.json`): `.` resolves to `dist/client.js` under the browser condition and to `dist/server.js` under import; `./client` and `./server` are explicit subpaths
- `scripts.build` (`package.json`): runs `tsdown && vite build && tsc -p tsconfig.build.json && vite build -c vite.test-host.config.ts`
- `default` (`vite.test-host.config.ts`): calls `testHostConfig({clientEntry: '@conciv/extension-terminal/client', outDir: dist/test-host})`; `test/terminal.test.ts` loads it via `fixtureHost(../dist/test-host)`
- `default` (`vitest.config.ts`): defines the `terminal` (node, 30s timeouts) and `terminal-browser` (chromium headless, 60s timeout) projects with `globalSetup: test/browser-server.global.ts`
- `default` (`uno.config.ts`): UnoCSS with `presetConciv()` scanning `src/**/*.{ts,tsx}`
- Subdirectories:
  - [src](./src/README.md): Holds the extension's two entry points: `client.tsx` registers the Terminal view, and `server.ts` mounts the oRPC router and the `/tty` WebSocket over pty sessions.

## Invariants

- `peerDependencies` (`package.json`) requires `solid-js` ^1.9.13
- `rollupOptions.external` (`vite.config.ts`) keeps `/^solid-js/`, `/^zod/`, `/^@conciv\//` and `/^lucide-solid/` out of the client bundle

## Side Effects

- `scripts.build` (`package.json`) writes into `dist/` (`emptyOutDir: false` in `vite.config.ts`), including `dist/test-host`

## Verification

- Run: `cd packages/extensions/terminal && pnpm test`
