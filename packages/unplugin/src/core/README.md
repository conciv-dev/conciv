# plugin/src/core

## Overview

The plugin internals: booting the engine process, the Vite hook (HTML tags, widget middleware, virtual extensions module, dev-server telemetry), the Next.js config wrapper and register hook, the generated client extensions entry and its watcher.

## Interface

- `boot.ts:makeEngineBooter(options, root, builtins, portPolicy)` - returns a memoized function that loads server extensions and starts the engine; `PortPolicy` is `'exact' | 'preferred'`.
- `vite.ts:makeViteHook(options, builtins)` - the Vite plugin (`apply: 'serve'`, `enforce: 'pre'`) with `resolveId`, `load`, `transform`, `transformIndexHtml` and `configureServer`.
- `widget-middleware.ts:htmlTags(corePort, {widget, entry})` - `conciv-api-base` meta, plus `conciv-widget` meta and the `entry` module script unless `widget === false`. `makeViteHook` passes `EXTENSIONS_DOCK_ROUTE` when Vite DevTools is installed, else `EXTENSIONS_ROUTE`.
- `widget-middleware.ts:makeWidgetInject(apiBase, widgetConfig)` - middleware that injects the same tags into served HTML when absent, always with the page module `EXTENSIONS_ROUTE`; an html already carrying either route gets no second script.
- `nextjs.ts:withConciv(nextConfig, options)` - adds `NEXT_PUBLIC_CONCIV_PORT` and `CONCIV_OPTIONS` env, a webpack alias for `@conciv/app-extensions`, and turbopack config.
- `nextjs.ts:registerWith` / `register` / `CONCIV_DEFAULT_PORT` (41700) - boot the engine from Next.js `instrumentation`.
- `extensions-entry.ts:writeExtensionsEntry(root)` / `generateExtensionsEntrySource(files)` - write `.conciv/extensions-client.gen.tsx`.
- `extensions-watch.ts:watchExtensionsDir(root)` - watches `<root>/conciv` and rewrites the entry on change.
- `bin-shim.ts:installConcivBinShim(stateDir)` - returns a `PATH` with `<stateDir>/bin` first.
- `open-editor.ts:makeOpenInEditor(root)` - opens `file:line` or `file:line:column` with `launch-editor`.
- `app-extensions.d.ts` - declares the `@conciv/app-extensions` module.
- `no-app-extensions.ts:entries` - an empty extension list, a build entry of its own (`dist/core/no-app-extensions.js`): the `@conciv/app-extensions` the starter imports on webpack and rspack.
- `widget-start.ts:isEnginePort(port)` - true for an integer from 1 to 65535; the starter and `writeWidgetClient` both check the port with it.
- `widget-start.ts:startConcivWidget(port)` - the browser starter shared by the Next.js widget entry and the webpack/rspack client entry; a build entry of its own (`dist/core/widget-start.js`).
- `bundler-widget.ts:writeWidgetClient(root, port)` - throws a `conciv:` error unless `port` is an integer in 1..65535, then writes `.conciv/widget-client.<port>.gen.js` (named for the port, so compilers that share a context with different ports each keep their own client), whose text is constant except the port: it imports the starter by the fixed specifier `@conciv/widget-start` (`nextjs.ts:WIDGET_START_SPECIFIER`, aliased by the webpack and rspack hooks), and calls `startConcivWidget(<port>)` with the port as an integer literal. The client is only the build entry, never an import target. `widgetStarterPath()` returns the `dist/core/widget-start.js` path the `@conciv/widget-start` alias points at, and `noAppExtensionsPath()` the `dist/core/no-app-extensions.js` path the `@conciv/app-extensions` alias points at.

## Invariants

- `boot.ts:makeEngineBooter` - the engine boots once; later calls return the same promise.
- `nextjs.ts:registerWith` - returns early in production or unless `NEXT_RUNTIME === 'nodejs'`.
- `nextjs.ts:registerWith` - known limit: conciv never stops the engine that `register()` boots, since neither Next.js instrumentation nor the `withConciv` config wrapper offers a close hook; the engine ends with the process.
- `nextjs.ts:withConciv` - with `enabled: false` returns the config with only `env` and `serverExternalPackages`; existing `process.env` keys are not overwritten. With `widget: false` it sets no `NEXT_PUBLIC_CONCIV_PORT`, so `nextjs-widget.ts` mounts nothing; `CONCIV_OPTIONS` still reaches `register()` and the engine boots.
- `extensions-entry.ts` - throws when two extension files resolve to the same extensionless specifier.
- `open-editor.ts:makeOpenInEditor` - a relative path is opened only when it resolves inside `root`.
- `vite.ts:makeViteHook` - when the resolved config is not `enabled`, `configureServer` boots nothing, `transformIndexHtml` adds no tags and `transform` returns null.
- `vite.ts:makeViteHook` - dock settings (`launcher: false`, `surface: 'dock'`) and the dock module go only through `transformIndexHtml`, the one pipeline Vite DevTools injects its dock into; html that reaches the page through the widget middleware alone (server-rendered hosts) gets the page module and the plain widget settings, so the launcher shows.

## Side Effects

- `boot.ts:makeEngineBooter` - starts the engine with a child env of `process.env` plus the shimmed `PATH` and `CONCIV_PORT`.
- `bin-shim.ts:installConcivBinShim` - creates `<stateDir>/bin` and symlinks `conciv` to `@conciv/cli/bin`.
- `extensions-entry.ts:writeExtensionsEntry` - creates `.conciv/` and writes `extensions-client.gen.tsx`.
- `bundler-widget.ts:writeWidgetClient` - creates `.conciv/` and writes `widget-client.<port>.gen.js`.
- `extensions-watch.ts:watchExtensionsDir` - a `chokidar` `watch` on `<root>/conciv`; logs watcher errors.
- `vite.ts` - `configureServer` boots the engine, mounts the widget middleware and passes the engine the `makeViteBridge` bundler bridge from `@conciv/extension/vite`; Vite's `closeServer` hook stops the engine that server booted, so `server.close()` (and a restart) settles only once the engine has stopped. A failed stop is logged, never thrown into Vite.
- `nextjs.ts:withConciv` - writes missing keys into `process.env`.
- `open-editor.ts` - launches the editor process.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/unplugin` from the repo root (turbo builds the package and its dependencies first)
