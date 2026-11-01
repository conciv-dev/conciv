# plugin/src/core

## Overview

The plugin internals: booting the engine process, the Vite hook (HTML tags, widget middleware, virtual extensions module, dev-server telemetry), the Next.js config wrapper and register hook, the generated client extensions entry and its watcher.

## Interface

- `boot.ts:makeEngineBooter(options, root, builtins, portPolicy)` - returns a memoized function that loads server extensions and starts the engine; `PortPolicy` is `'exact' | 'preferred'`.
- `vite.ts:makeViteHook(options, builtins)` - the Vite plugin (`apply: 'serve'`, `enforce: 'pre'`) with `resolveId`, `load`, `transform`, `transformIndexHtml` and `configureServer`.
- `vite.ts:makeViteBridge(server)` - a `BundlerBridge` that reports `build-error`, `hmr-update` and `request-trace` events.
- `widget-middleware.ts:htmlTags(corePort, {widget})` - `conciv-api-base` meta, plus `conciv-widget` meta and the `EXTENSIONS_ROUTE` module script unless `widget === false`.
- `widget-middleware.ts:makeWidgetInject(apiBase, widgetConfig)` - middleware that injects the same tags into served HTML when absent.
- `nextjs.ts:withConciv(nextConfig, options)` - adds `NEXT_PUBLIC_CONCIV_PORT` and `CONCIV_OPTIONS` env, a webpack alias for `@conciv/app-extensions`, and turbopack config.
- `nextjs.ts:registerWith` / `register` / `CONCIV_DEFAULT_PORT` (41700) - boot the engine from Next.js `instrumentation`.
- `extensions-entry.ts:writeExtensionsEntry(root)` / `generateExtensionsEntrySource(files)` - write `.conciv/extensions-client.gen.tsx`.
- `extensions-watch.ts:watchExtensionsDir(root)` - watches `<root>/conciv` and rewrites the entry on change.
- `bin-shim.ts:installConcivBinShim(stateDir)` - returns a `PATH` with `<stateDir>/bin` first.
- `open-editor.ts:makeOpenInEditor(root)` - opens `file:line` with `launch-editor`.
- `vite-tools.ts:viteConfig` / `viteResolve` / `viteGraph` / `viteTransform` / `viteUrls` - Vite dev-server queries.
- `app-extensions.d.ts` - declares the `@conciv/app-extensions` module.

## Invariants

- `boot.ts:makeEngineBooter` - the engine boots once; later calls return the same promise.
- `nextjs.ts:registerWith` - returns early in production or unless `NEXT_RUNTIME === 'nodejs'`.
- `nextjs.ts:withConciv` - with `enabled: false` returns the config with only `env` and `serverExternalPackages`; existing `process.env` keys are not overwritten.
- `extensions-entry.ts` - throws when two extension files resolve to the same extensionless specifier.
- `open-editor.ts:makeOpenInEditor` - a relative path is opened only when it resolves inside `root`.
- `vite.ts:makeViteHook` - when the resolved config is not `enabled`, `configureServer` boots nothing, `transformIndexHtml` adds no tags and `transform` returns null.

## Side Effects

- `boot.ts:makeEngineBooter` - starts the engine with a child env of `process.env` plus the shimmed `PATH` and `CONCIV_PORT`.
- `bin-shim.ts:installConcivBinShim` - creates `<stateDir>/bin` and symlinks `conciv` to `@conciv/cli/bin`.
- `extensions-entry.ts:writeExtensionsEntry` - creates `.conciv/` and writes `extensions-client.gen.tsx`.
- `extensions-watch.ts:watchExtensionsDir` - a `chokidar` `watch` on `<root>/conciv`; logs watcher errors.
- `vite.ts` - `configureServer` boots the engine, mounts the widget middleware and stops the engine when the HTTP server closes; `makeViteBridge` unshifts a request-trace middleware and listens to `server.watcher` changes.
- `nextjs.ts:withConciv` - writes missing keys into `process.env`.
- `open-editor.ts` - launches the editor process.

## Verification

- Run: `cd packages/plugin && pnpm test`
