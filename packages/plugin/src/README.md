# plugin/src

## Overview

The unplugin factory and its per-bundler entries. Vite gets the full hook; webpack and rspack boot the engine; rollup and esbuild are no-ops. Next.js has its own config wrapper and a client widget entry.

## Interface

- `index.ts:createConcivUnplugin(builtins = NO_BUILTINS)` - `UnpluginInstance<ConcivConfig | undefined>` named `conciv`.
- `index.ts:unplugin` (default export) - `createConcivUnplugin()`; also re-exports `NO_BUILTINS` and `Builtins`.
- `vite.ts` / `webpack.ts` / `rspack.ts` / `rollup.ts` / `esbuild.ts` - default export `unplugin.<bundler>`; `vite.ts` also exports `makeViteBridge`.
- `nextjs.ts` - re-exports `withConciv`, `register`, `registerWith`, `CONCIV_DEFAULT_PORT` from `core/nextjs.ts`.
- `nextjs-widget.ts` - client entry that mounts the widget with the `@conciv/app-extensions` entries.
- `nextjs-edge.ts:register` - an empty edge-runtime `register`.
- Subdirectories: [core](./core/README.md).

## Invariants

- `index.ts:createConcivUnplugin` - webpack and rspack boot the engine only when `options.enabled !== false`, with the `exact` port policy.
- `nextjs-widget.ts` - starts only in a browser, when `NEXT_PUBLIC_CONCIV_PORT` is set and `NODE_ENV` is not `production`.

## Side Effects

- `nextjs-widget.ts:startWidget` - sets `window.__CONCIV_API_BASE__` to `http://127.0.0.1:<port>`, dynamically imports `@conciv/app-extensions`, `@conciv/embed` and the dedupe module, and mounts the widget; dropped extensions are logged with `console.warn`.
- `index.ts` - booting reads `process.cwd()` as the project root.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin` from the repo root (turbo builds the package and its dependencies first)
