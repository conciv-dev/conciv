# it/src/plugin

## Overview

One entry file per bundler subpath of `@conciv/it/plugin/*`. Each re-exports the matching hook of the shared unplugin instance, or the Next.js helpers from `@conciv/plugin`.

## Interface

- `vite.ts` / `webpack.ts` / `rspack.ts` / `rollup.ts` / `esbuild.ts` - default export `unplugin.<bundler>` from `../plugin-instance.js`; `vite.ts` also re-exports the `ConcivConfig` type.
- `nextjs.ts` - re-exports `@conciv/plugin/nextjs` and defines `register()`, which loads the built-in server extensions for `@conciv/it/plugin/nextjs`.
- `nextjs-edge.ts` - re-exports `register` from `@conciv/plugin/nextjs`.
- `nextjs-widget.ts` - side-effect import of `@conciv/plugin/nextjs/widget`.

## Invariants

- `nextjs.ts:register` - returns early unless `process.env.NEXT_RUNTIME === 'nodejs'`.
- `nextjs.ts:register` - a failure loading the built-in extensions is logged and falls back to empty `serverExtensions`.

## Side Effects

- `nextjs.ts:register` - reads `process.cwd()` to load extension packages through `loadExtensionPackages`.
- `nextjs-widget.ts` - importing it runs the widget loader from `@conciv/plugin/nextjs/widget`.

## Verification

- Run: `cd packages/it && pnpm test`
