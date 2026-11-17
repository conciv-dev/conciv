# @conciv/extension-page

## Overview

What is left of the old page extension, until the grab port and the design port take its last pieces. package.json exports `.` and `./server` (dist/server.js, the engine extension with the grab attachment), `./defs` and `./capture-plugins`. No browser entry is left: the page tools, cards, simulator and grab card are the built-in page plugin's (`@conciv/builtin-plugins`, `@conciv/plugin-page`). The build runs tsdown over src/server.ts, src/shared/defs.ts and src/client/capture-plugins.ts as ESM, then tsc emits declarations only. The package has no tests of its own. Children: src/.

## Interface

- `.` and `./server` exports (`package.json`): dist/server.js
- `./defs` export (`package.json`): dist/shared/defs.js
- `./capture-plugins` export (`package.json`): dist/client/capture-plugins.js
- `build` script (`package.json`): `tsdown && tsc -p tsconfig.build.json`
- `defineConfig` entry list (`tsdown.config.ts`): src/server.ts, src/shared/defs.ts, src/client/capture-plugins.ts
- Subdirectories:
  - [src](./src/README.md): server.ts (Node) defines the remnant `page` extension, plus the client/, server/ and shared/ subdirectories.

## Invariants

- `peerDependencies.solid-js` (`package.json`) requires `^1.9.13`

## Side Effects

- `build` script (`package.json`) writes bundles and .d.ts files to dist/
- `typecheck` writes .tsbuildinfo beside `tsconfig.json`

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/extension-page` from the repo root
