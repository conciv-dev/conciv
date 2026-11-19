# plugin/src

## Overview

The unplugin factory and its per-bundler entries. Vite gets the full hook; webpack and rspack add the widget entry and boot the engine in a development build; rollup and esbuild are no-ops. Next.js has its own config wrapper and a client widget entry.

## Interface

- `index.ts:createConcivUnplugin(builtins = NO_BUILTINS)` - `UnpluginInstance<ConcivConfig | undefined>` named `conciv`.
- `index.ts:unplugin` (default export) - `createConcivUnplugin()`; also re-exports `NO_BUILTINS` and `Builtins`.
- `vite.ts` / `webpack.ts` / `rspack.ts` / `rollup.ts` / `esbuild.ts` - default export `unplugin.<bundler>`.
- `nextjs.ts` - re-exports `withConciv`, `register`, `CONCIV_DEFAULT_PORT` from `core/nextjs.ts`.
- `nextjs-widget.ts` - client entry that starts the widget (`core/widget-start.ts`) with `Number(NEXT_PUBLIC_CONCIV_PORT)`.
- `nextjs-edge.ts:register` - an empty edge-runtime `register`.
- Subdirectories: [core](./core/README.md).

## Invariants

- `index.ts:createConcivUnplugin` - webpack and rspack do nothing when `options.enabled === false` or the compiler `mode` is `production` (an unset `mode` counts as `production`, the bundlers' default). Otherwise they write `.conciv/widget-client.<port>.gen.js` under `compiler.context`, alias `@conciv/widget-start` (`WIDGET_START_SPECIFIER`) to `dist/core/widget-start.js`, and add the client as a global entry (`EntryPlugin` with no name, as webpack-dev-server adds its client), so every chunk entry starts the widget against `http://127.0.0.1:<port>`; `port` defaults to `CONCIV_DEFAULT_PORT` (24170). They boot the engine on that same port, with the `exact` port policy, on the compiler's first `watchRun` (the hook both bundlers call only from their `Watching`, so a dev server or `--watch` run): a one-off production build starts no engine and exits. `watchClose` stops the engine and the compiler's awaited `shutdown` hook (run by `compiler.close()`) waits for that same stop, so a closed compiler leaves no engine behind; the stop runs once. When `writeWidgetClient` cannot write the client (a `.conciv` that is a file, a folder that cannot be written, or a `port` outside 1..65535) it logs one `conciv:` line and they set no alias and add no entry, the build goes on and the engine still starts. With `options.widget === false` they boot and stop the engine the same way but write no `.conciv/widget-client.<port>.gen.js`, set no alias and add no entry, so the page carries no widget. A failed start never rejects into the bundler: a taken `port` logs `conciv: port <port> is already in use, the engine did not start. ...` once (the policy stays exact, since nothing hands the page the engine address at runtime), any other failure logs `conciv: the engine failed to start`, and the bundler keeps watching without an engine.
- `nextjs-widget.ts` - starts only in a browser, when `NEXT_PUBLIC_CONCIV_PORT` is set and `NODE_ENV` is not `production`.

## Side Effects

- `core/widget-start.ts:startConcivWidget(port)` - in a browser, outside `production` and for an integer `port` in 1..65535 (any other value mounts nothing), sets `window.__CONCIV_API_BASE__` to `http://127.0.0.1:<port>`, waits for `DOMContentLoaded`, dynamically imports `@conciv/embed` and mounts the widget; a failed mount is logged with `console.error`.
- `index.ts` - the webpack and rspack hooks write `.conciv/widget-client.<port>.gen.js` and change `compiler.options.resolve.alias`.
- `index.ts` - booting reads `process.cwd()` as the project root.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/unplugin` from the repo root (turbo builds the package and its dependencies first)
