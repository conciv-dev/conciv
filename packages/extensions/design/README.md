# @conciv/extension-design

## Overview

The package.json describes this as the design built-in extension, internal to @conciv/it. It holds a target image per route and width, captures the live page at that width and returns ranked component deltas with style provenance. The root exports pick a browser condition (dist/client.js) or an import condition (dist/server.js), with subpaths ./client, ./server, ./defs, ./provenance and ./types. The `build` script runs four steps in order: tsdown, vite build (client), vite build with vite.xray.config.ts (xray page into dist/xray), then tsc declaration emit (which excludes src/xray).

## Interface

- default `defineConfig` (`tsdown.config.ts`): bundles `src/server.ts`, `src/shared/defs.ts` and `src/server/provenance/mappers.ts` as ESM with `dts: false`
- default `defineConfig` (`vite.config.ts`): library build of `src/client.ts` to `client.js` (ES format), with `emptyOutDir: false` and sourcemaps
- default `defineConfig` (`vite.xray.config.ts`): builds `src/xray/` into `dist/xray/` with UnoCSS and the Solid plugin; in serve mode it loads `../../it/dist/vite.js` instead of plain Solid
- default `defineConfig` (`uno.config.ts`): UnoCSS with `presetConciv`, scanning `src/xray/**` and `../../ui-kit-system/src/**`
- package.json `exports`: `.` (browser maps to client, import maps to server), `./client`, `./server`, `./defs`, `./provenance` (`dist/server/provenance/mappers`), `./types` (types only)
- package.json script `dev:xray`: runs `vite --config vite.xray.config.ts`
- Subdirectories:
  - [src](./src/README.md): Holds the two entry points of the design extension: `client.ts` registers the browser-side tools and the capture-frame responder, and `server.ts` wires up the target store, a lazy CSS source map, the xray router/app and the design runtime context.

## Invariants

- `rollupOptions.external` (`vite.config.ts`) treats imports matching solid-js, zod, @conciv/, lucide-solid, rrweb, @rrweb/, @tanstack/, @orpc/, @zumer/ or @bramus/ as external unless the import path contains `.css`
- `renderBuiltUrl` (`vite.xray.config.ts`) prefixes HTML asset URLs with `xray/` and uses relative URLs for JS and CSS
- `exclude: ["src/xray/**"]` (`tsconfig.build.json`): no declarations are emitted for the xray page

## Side Effects

- `build` script (package.json): writes dist/ (server.js, shared/defs.js, server/provenance/mappers.js, client.js, xray/, .d.ts files); the xray build empties `dist/xray/` (`emptyOutDir: true` in `vite.xray.config.ts`)
- `compiler` (`vite.xray.config.ts`): in serve mode it dynamically imports the sibling package build at `../../it/dist/vite.js`

## Verification

- Run: `cd packages/extensions/design && pnpm typecheck && pnpm lint` (the package has no `test` script)
