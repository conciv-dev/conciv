# @conciv/extension-whiteboard

The whiteboard built-in extension: an Excalidraw canvas the user and the AI share over the dev
app, with source-anchored comments and pins, running on a local drizzle/libSQL db with an SSE-fed
TanStack DB client on the `@conciv/extension` contract.

Part of [conciv](https://github.com/conciv-dev/conciv) and wired in by default via the umbrella
package:

```sh
npm install -D @conciv/it
```

## Interface

- `exports["."]` (`package.json`): the `browser` condition resolves to dist/client.js and the `import` condition resolves to dist/server.js
- `exports["./client"]` / `exports["./server"]` (`package.json`): explicit client and server entries; `files` publishes `dist` and `drizzle`
- `scripts.build` (`package.json`): runs `tsdown && vite build && tsc -p tsconfig.build.json && vite build -c vite.test-host.config.ts`
- `defineConfig` default (`drizzle.config.ts`): dialect `sqlite`, schema `./src/server/db/schema.ts`, out `./drizzle`
- `defineConfig` default (`tsdown.config.ts`): entry `src/server.ts`, format esm, `dts: false`
- `defineConfig` default (`vite.config.ts`): lib build of `src/client.tsx` to `client.js` with plugins solid and wasm, React dedupe, and `emptyOutDir: false`
- `testHostConfig` usage (`vite.test-host.config.ts`): builds `@conciv/extension-whiteboard/client` into dist/test-host. test/canvas-it-helpers.ts loads it via `fixtureHost` as `testHost`
- `defineConfig` default (`vitest.config.ts`): project `whiteboard` (node, test/**/\*.test.ts) and project `whiteboard-browser` (Playwright chromium headless, test/**/*.browser.test.tsx)
- `defineConfig` default (`uno.config.ts`): UnoCSS with `presetConciv` scanning src/**/*.{ts,tsx}
- `peerDependencies.solid-js` (`package.json`): ^1.9.13
- Subdirectories:
  - [src](./src/README.md): Entry points: server.ts defines the server half of the whiteboard extension (libSQL store, oRPC router, tools, turn-end auto-commit) and client.tsx defines the browser half (composer buttons, overlay surface, open/pick state).

## Invariants

- `rollupOptions.external` (`vite.config.ts`): solid-js, zod, @conciv/_, node:_ and oxc-parser are never bundled into client.js
- `define` (`vite.config.ts`): `process.env.NODE_ENV` is fixed to "production" and `process.env.IS_PREACT` to "false" in the client build
- `localForkCap` (`vitest.config.ts`): when neither `GITHUB_ACTIONS` nor a valid integer `VITEST_MAX_FORKS` >= 1 is set, it caps `maxWorkers` at 3
- `testTimeout` (`vitest.config.ts`): 200_000 ms in both projects
- `exclude` (`tsconfig.build.json`): src/**/*.test.ts(x) are left out of declaration emit, and `emitDeclarationOnly` is true

## Side Effects

- `out: './drizzle'` (`drizzle.config.ts`): drizzle-kit writes migration SQL and meta into ./drizzle (currently 0000_whiteboard-init.sql)
- `outDir` (`vite.test-host.config.ts`): writes the built test host to dist/test-host
- `build` (`vite.config.ts`): writes dist/client.js with sourcemaps and does not empty dist

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-whiteboard` from the repo root (turbo builds the package and its dependencies first)
