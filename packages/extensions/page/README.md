# @conciv/extension-page

## Overview

package.json routes the `.` export through conditions: `browser` resolves to dist/client.js and `import` resolves to dist/server.js. It also exports `./client`, `./server`, `./defs` and `./body-margins`. The build runs in three steps: tsdown bundles src/server.ts, src/shared/defs.ts and src/client/body-margins.ts as ESM; vite builds src/client.tsx with solid into dist/client.js; tsc emits declarations only. vitest runs two Chromium browser projects through Playwright: `browser` uses the React JSX runtime and `browser-solid` covers `*.solid.browser.test.tsx`. Children: src/ (sources) and test/ (page.browser.test.tsx, page.solid.browser.test.tsx and fixtures/).

## Interface

- `.` export (`package.json`): `browser` condition gives dist/client.js, `import` condition gives dist/server.js
- `./defs` export (`package.json`): dist/shared/defs.js
- `./body-margins` export (`package.json`): dist/client/body-margins.js
- `build` script (`package.json`): `tsdown && vite build && tsc -p tsconfig.build.json`
- `test` script (`package.json`): `vitest run` with projects `browser` and `browser-solid` (`vitest.config.ts`)
- `defineConfig` entry list (`tsdown.config.ts`): src/server.ts, src/shared/defs.ts, src/client/body-margins.ts
- `build.lib.entry` (`vite.config.ts`): src/client.tsx, output fileName client.js
- `presetConciv` (`uno.config.ts`): UnoCSS preset that scans src/**/*.{ts,tsx}
- Subdirectories:
  - [src](./src/README.md): Holds the two entry points, client.tsx (browser) and server.ts (Node), which both define the `page` extension from shared tool defs, plus the client/, server/ and shared/ subdirectories.

## Invariants

- `rollupOptions.external` (`vite.config.ts`) keeps solid-js, zod, @conciv/_, lucide-solid, rrweb, @rrweb/_, @tanstack/* and @orpc/* out of the client bundle; any import containing `.css` is always bundled
- `emptyOutDir: false` (`vite.config.ts`) keeps the tsdown output in dist when vite builds
- `define: {'import.meta.hot': 'import.meta.hot'}` (`vite.config.ts`) leaves import.meta.hot untouched in the built client
- `fileParallelism: false` (`vitest.config.ts`) runs browser test files one at a time in both projects
- `exclude` (`tsconfig.json`, `tsconfig.refs.json`) leaves test/fixtures/react-app.tsx and test/page.browser.test.tsx out of the solid typecheck
- `peerDependencies.solid-js` (`package.json`) requires `^1.9.13`

## Side Effects

- `build` script (`package.json`) writes bundles and .d.ts files to dist/
- `tsBuildInfoFile` (`tsconfig.json`) writes .tsbuildinfo; `outDir` (`tsconfig.refs.json`) writes .tsc-refs/, which `.gitignore` ignores
- `provider: playwright({})` (`vitest.config.ts`) launches headless Chromium for tests

## Verification

- Run: `cd packages/extensions/page && pnpm test`
