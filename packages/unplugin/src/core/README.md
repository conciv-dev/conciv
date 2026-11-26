# unplugin/src/core

## Overview

The plugin internals: booting the engine process (`boot.ts`), the Vite hook (`vite.ts`: HTML tags, widget middleware, the widget module, dev-server telemetry), the Vite bundler bridge (`vite-bridge.ts`, the `./vite-bridge` export), the Next.js config wrapper and register hook (`nextjs.ts`), the browser starter the Next.js and webpack/rspack client entries share (`widget-start.ts`), and the drive address handed to the widget when `CONCIV_DRIVE` is set (`drive-endpoint.ts`).

## Invariants

- The browser starter is `startConcivWidget(port, drive?)`: it mounts only in a browser, outside `production`, for an integer `port` in 1..65535 (`isEnginePort`); it sets `window.__CONCIV_API_BASE__` to `http://127.0.0.1:<port>` and, when `drive` is given, `window.__CONCIV_DRIVE__`, each only when the page has not set it, then imports `@conciv/app` and calls `mountConciv()` once the DOM is ready (`widget-start.ts`). It is a build entry of its own (`dist/core/widget-start.js`).
- The webpack/rspack client `../unplugin.ts:writeWidgetClient(root, {askedPort, port})` writes `.conciv/widget-client.<askedPort>.gen.js` (named for the asked port, so compilers that share a context with different ports each keep their own), whose text is constant except the chosen engine port: `import {startConcivWidget} from '@conciv/widget-start'` (`WIDGET_START_SPECIFIER`, aliased by the webpack and rspack hooks to `dist/core/widget-start.js`) and `startConcivWidget(<port>)` with the port as an integer literal. A port outside 1..65535, or a `.conciv/` it cannot write, logs one `conciv:` line and writes nothing. It stays synchronous, because the entry it feeds is set while the compiler is configured.
- `nextjs.ts:withConciv` picks the engine port: the port already in `CONCIV_OPTIONS` from an earlier config load, else `options.port`, else the port in the state folder's `server.json`, else `CONCIV_DEFAULT_PORT` (24170) plus a sha256 hash of the state root modulo 1000, each when free, else a free one (`chooseEnginePort`). It sets `NEXT_PUBLIC_CONCIV_PORT`, `NEXT_PUBLIC_CONCIV_DRIVE` (when driving) and `CONCIV_OPTIONS`, and adds the engine packages to `serverExternalPackages`.
- `nextjs.ts:register` loads `boot` from its own dist file with `import(/* webpackIgnore: true */ url)`, so Turbopack and webpack keep the engine out of the instrumentation bundle even when `@conciv/it` is workspace-linked.
- `vite-bridge.ts:makeViteBridge` throws a `NOT_FOUND` oRPC error naming the file when no module in the graph matches.
- `boot.ts:makeEngineBooter` - the engine boots once; later calls return the same promise.
- `nextjs.ts:register` - returns early in production or unless `NEXT_RUNTIME === 'nodejs'`.
- `nextjs.ts:register` - known limit: conciv never stops the engine that `register()` boots, since neither Next.js instrumentation nor the `withConciv` config wrapper offers a close hook; the engine ends with the process.
- `nextjs.ts:withConciv` - with `enabled: false` returns the config with only `env` and `serverExternalPackages`; existing `process.env` keys are not overwritten. With `widget: false` it sets no `NEXT_PUBLIC_CONCIV_PORT`, so `nextjs-widget.ts` mounts nothing; `CONCIV_OPTIONS` still reaches `register()` and the engine boots.
- `open-editor.ts:makeOpenInEditor` - a relative path is opened only when it resolves inside `root`.
- `vite.ts:makeViteHook` - in vitest (`mode === 'test'`) the plugin adds no config, starts no engine and stamps no JSX source. It knows no test kit: a package's test projects come from the plugin it adds for them (`concivTest()` from `@internal/vitest-config/conciv-test`).
- `vite.ts:makeViteHook` - when the resolved config is not `enabled`, `configureServer` boots nothing, `transformIndexHtml` adds no tags and `transform` returns null.
- `vite.ts:makeViteHook` - dock settings (`launcher: false`, `surface: 'dock'`) and the dock module go only through `transformIndexHtml`, the one pipeline Vite DevTools injects its dock into; html that reaches the page through the widget middleware alone (server-rendered hosts) gets the page module and the plain widget settings, so the launcher shows.

## Side Effects

- `boot.ts:makeEngineBooter` - starts the engine with a child env of `process.env` plus the shimmed `PATH` and `CONCIV_PORT`.
- `bin-shim.ts:installConcivBinShim` - creates `<stateDir>/bin` and symlinks `conciv` to the resolved file of `@conciv/cli/bin`, only when that file exists; a link it cannot make is logged once as `conciv: could not link the conciv command into <dir>` and the engine boots without it.
- `../unplugin.ts:writeWidgetClient` - creates `.conciv/` and its `.gitignore` (only when absent), and writes `widget-client.<port>.gen.js`, all with blocking calls.
- `vite.ts` - `configureServer` boots the engine, mounts the widget middleware and passes the engine the `vite-bridge.ts:makeViteBridge` bundler bridge; the engine that server booted starts stopping when Vite's http server emits `close`, before Vite closes its environments and runs the `closeServer` hooks; the `closeServer` hook awaits that same stop (and starts it when the http server never listened), so `server.close()` (and a restart) settles only once the engine has stopped and the engine's `stop` runs once. A failed stop is logged, never thrown into Vite.
- `nextjs.ts:withConciv` - writes missing keys into `process.env`.
- `open-editor.ts` - launches the editor process.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/unplugin` from the repo root (turbo builds the package and its dependencies first)
