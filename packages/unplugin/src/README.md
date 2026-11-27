# unplugin/src

## Overview

The unplugin factory and its per-bundler entries. Vite gets the full hook; webpack and rspack add the widget entry and boot the engine in a development build; rollup and esbuild are no-ops. Next.js has its own config wrapper and a client widget entry.

## Interface

- `unplugin.ts` is the factory (`createConcivUnplugin`, an `UnpluginInstance` named `conciv`); each bundler file is
  one entry; `nextjs-widget.ts` is the Next.js client entry and `nextjs-edge.ts` an empty edge-runtime `register`.
- Subdirectories: [core](./core/README.md).

## Invariants

- `unplugin.ts:createConcivUnplugin` - webpack and rspack do nothing when `options.enabled === false` or the compiler `mode` is `production` (an unset `mode` counts as `production`, the bundlers' default). Otherwise they write `.conciv/widget-client.<port>.gen.js` under `compiler.context`, alias `@conciv/widget-start` (`WIDGET_START_SPECIFIER`) to `dist/core/widget-start.js`, and add the client as a global entry (`EntryPlugin` with no name, as webpack-dev-server adds its client), so every chunk entry starts the widget against the engine; `<port>` in the file name is the asked port, `options.port` or `CONCIV_DEFAULT_PORT` (24170). On the compiler's first `watchRun` they pick the engine port with `chooseEnginePort` (the same rule as Next.js: `options.port`, else the recorded `server.json` port, else the per-project port, when free, else a free one), rewrite the client with it before the compile, and boot the engine on exactly that port (the hook both bundlers call only from their `Watching`, so a dev server or `--watch` run): a one-off production build starts no engine and exits. `watchClose` stops the engine and the compiler's awaited `shutdown` hook (run by `compiler.close()`) waits for that same stop, so a closed compiler leaves no engine behind; the stop runs once. When `writeWidgetClient` cannot write the client (a `.conciv` that is a file, a folder that cannot be written, or a `port` outside 1..65535) it logs one `unplugin` error (shown when logs are on, `logLevel` or `CONCIV_LOG_LEVEL`) and they set no alias and add no entry, the build goes on and the engine still starts. With `options.widget === false` they boot and stop the engine the same way but write no `.conciv/widget-client.<port>.gen.js`, set no alias and add no entry, so the page carries no widget. A failed start rejects the `watchRun` hook with `conciv: the engine failed to start` (the cause attached), so the bundler reports the build as failed instead of serving a page with no engine.
- `nextjs-widget.ts` - starts only in a browser, when `NEXT_PUBLIC_CONCIV_PORT` is set and `NODE_ENV` is not `production`

## Side Effects

- `core/widget-start.ts:startConcivWidget(port)` - in a browser, outside `production` and for an integer `port` in 1..65535 (any other value mounts nothing), sets `window.__CONCIV_API_BASE__` to `http://127.0.0.1:<port>` unless the page already set it, waits for `DOMContentLoaded`, dynamically imports `@conciv/app` and calls its `mountConciv()`; a failed mount is logged by the widget's own logger, and the rejection is dropped.
- `unplugin.ts` - the webpack and rspack hooks write `.conciv/widget-client.<port>.gen.js` and change `compiler.options.resolve.alias`.
- `unplugin.ts` - booting reads `process.cwd()` as the project root.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/unplugin` from the repo root (turbo builds the package and its dependencies first)
