# plugin/src/core

## Overview

The plugin internals: booting the engine process, the Vite hook (HTML tags, widget middleware, the widget module, dev-server telemetry), the Next.js config wrapper and register hook, and the webpack/rspack widget client.

## Interface

- `boot.ts:makeEngineBooter(options, root, builtins)` - returns a memoized function that starts the engine on exactly `options.port` when one is set.
- `vite-bridge.ts:makeViteBridge(server)` (the `./vite-bridge` export, a build entry of its own: `dist/core/vite-bridge.js`): resolves to a `BundlerBridge` over a Vite dev server (config, resolve, module graph, transform, urls, restart); the module graph takes a file path relative to the Vite root, a `/src/...` url or an absolute path, and throws a `NOT_FOUND` oRPC error naming the file when no module matches (an oRPC error because it is the one error the engine passes to the CLI as a user error today; a declared error on the `server_graph` tool would be a contract change); its `subscribe` reports `build-error`, `hmr-update` and `request-trace` diagnostics; the first subscribe wraps the client hot channel, watches file changes and unshifts a request-trace middleware.
- `vite.ts:makeViteHook(options, builtins)` - the Vite plugin (`apply: 'serve'`, `enforce: 'pre'`) with `resolveId`, `load`, `transform`, `transformIndexHtml` and `configureServer`.
- `widget-middleware.ts:htmlTags(corePort, {widget, entry})` - `conciv-api-base` meta, plus `conciv-widget` meta and the `entry` module script unless `widget === false`. `makeViteHook` passes `WIDGET_DOCK_ROUTE` when Vite DevTools is installed, else `WIDGET_ROUTE`.
- `widget-middleware.ts:makeWidgetInject(apiBase, widgetConfig)` - middleware that injects the same tags into served HTML when absent, always with the page module `WIDGET_ROUTE`; an html already carrying either route gets no second script.
- `nextjs.ts:withConciv(nextConfig, options)` - adds `NEXT_PUBLIC_CONCIV_PORT` and `CONCIV_OPTIONS` env, the engine packages to `serverExternalPackages`, and a webpack hook that aliases the edge register entries away.
- `nextjs.ts:register` / `CONCIV_DEFAULT_PORT` (24170) - boot the engine from Next.js `instrumentation`. `register` loads `boot` from its own dist file (`dist/core/boot.js`, an extra `tsdown.config.ts` entry) with `import(/* webpackIgnore: true */ url)`, so Turbopack and webpack keep the engine out of the instrumentation bundle even when `@conciv/it` is workspace-linked and `serverExternalPackages` does not apply.
- `bin-shim.ts:installConcivBinShim(stateDir)` - returns a `PATH` with `<stateDir>/bin` first.
- `open-editor.ts:makeOpenInEditor(root)` - opens `file:line` or `file:line:column` with `launch-editor`.
- `widget-start.ts:isEnginePort(port)` - true for an integer from 1 to 65535; the starter and `writeWidgetClient` both check the port with it.
- `widget-start.ts:startConcivWidget(port)` - the browser starter shared by the Next.js widget entry and the webpack/rspack client entry; a build entry of its own (`dist/core/widget-start.js`).
- `../index.ts:writeWidgetClient(root, port)` - logs one `conciv:` line and returns `undefined` unless `port` is an integer in 1..65535 (the engine start logs a bad port the same way and the bundler goes on), and logs one `conciv:` line naming the client path and the cause and returns `undefined` when `.conciv/` or the client cannot be written; otherwise it writes `.conciv/widget-client.<port>.gen.js` (named for the port, so compilers that share a context with different ports each keep their own client), whose text is constant except the port: it imports the starter by the fixed specifier `@conciv/widget-start` (`nextjs.ts:WIDGET_START_SPECIFIER`, aliased by the webpack and rspack hooks), and calls `startConcivWidget(<port>)` with the port as an integer literal. The client is only the build entry, never an import target. `widgetStarterPath()` returns the `dist/core/widget-start.js` path the `@conciv/widget-start` alias points at.

## Invariants

- `boot.ts:makeEngineBooter` - the engine boots once; later calls return the same promise.
- `nextjs.ts:register` - returns early in production or unless `NEXT_RUNTIME === 'nodejs'`.
- `nextjs.ts:register` - known limit: conciv never stops the engine that `register()` boots, since neither Next.js instrumentation nor the `withConciv` config wrapper offers a close hook; the engine ends with the process.
- `nextjs.ts:withConciv` - with `enabled: false` returns the config with only `env` and `serverExternalPackages`; existing `process.env` keys are not overwritten. With `widget: false` it sets no `NEXT_PUBLIC_CONCIV_PORT`, so `nextjs-widget.ts` mounts nothing; `CONCIV_OPTIONS` still reaches `register()` and the engine boots.
- `open-editor.ts:makeOpenInEditor` - a relative path is opened only when it resolves inside `root`.
- `vite.ts:makeViteHook` - in vitest (`mode === 'test'`) the `config` hook imports `@conciv/plugin-testkit/vitest`, an optional peer, and adds its `testProjects()`; no folder is searched. When that package is not installed (`ERR_MODULE_NOT_FOUND` naming it) no projects are added; any other failure while loading it is thrown to the author.
- `vite.ts:makeViteHook` - when the resolved config is not `enabled`, `configureServer` boots nothing, `transformIndexHtml` adds no tags and `transform` returns null.
- `vite.ts:makeViteHook` - dock settings (`launcher: false`, `surface: 'dock'`) and the dock module go only through `transformIndexHtml`, the one pipeline Vite DevTools injects its dock into; html that reaches the page through the widget middleware alone (server-rendered hosts) gets the page module and the plain widget settings, so the launcher shows.

## Side Effects

- `boot.ts:makeEngineBooter` - starts the engine with a child env of `process.env` plus the shimmed `PATH` and `CONCIV_PORT`.
- `bin-shim.ts:installConcivBinShim` - creates `<stateDir>/bin` and symlinks `conciv` to the resolved file of `@conciv/cli/bin`, only when that file exists; a link it cannot make is logged once as `conciv: could not link the conciv command into <dir>` and the engine boots without it.
- `../index.ts:writeWidgetClient` - creates `.conciv/` and writes `widget-client.<port>.gen.js`.
- `vite.ts` - `configureServer` boots the engine, mounts the widget middleware and passes the engine the `vite-bridge.ts:makeViteBridge` bundler bridge; the engine that server booted starts stopping when Vite's http server emits `close`, before Vite closes its environments and runs the `closeServer` hooks; the `closeServer` hook awaits that same stop (and starts it when the http server never listened), so `server.close()` (and a restart) settles only once the engine has stopped and the engine's `stop` runs once. A failed stop is logged, never thrown into Vite.
- `nextjs.ts:withConciv` - writes missing keys into `process.env`.
- `open-editor.ts` - launches the editor process.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/unplugin` from the repo root (turbo builds the package and its dependencies first)
