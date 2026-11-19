# extension-compiler/src

## Overview

Build-time code for conciv extensions. It splits extension modules into browser and node halves with Babel and dead-code elimination, compiles extension TSX with `babel-preset-solid`, stamps `data-tsd-source` attributes onto JSX (TanStack devtools `addSourceToJsx`), and generates the `virtual:conciv-extensions` module that mounts the widget on the page or in a dock. Extensions are no longer loaded into the widget or the engine by this package.

## Interface

- `splitExtension(code, id, env: 'browser' | 'node')` -> `{code, map}` or null (`split-extension.ts`): browser output collapses `.server()`; node output collapses `.client()` / `.render()` / `.card()` and strips `Component` / `Surface` / `views`; both then run dead-code elimination. `SplitEnv` type.
- `compileExtensionSolid(code, id, ssr)` (`compile-extension.ts`): Babel with `babel-preset-solid` (`generate: 'ssr' | 'dom'`) and preset-typescript.
- `isExtensionModule(id)` (`compile-extension.ts`): matches paths under `/conciv/extensions/` ending in `.ts`, `.tsx`, `.js` or `.jsx`.
- `EXTENSIONS_VIRTUAL_ID` = `'virtual:conciv-extensions'`, `EXTENSIONS_RESOLVED_ID` = `'\0virtual:conciv-extensions'`, `WIDGET_ROUTE` = `'/@conciv/widget.js'`, `EXTENSIONS_DOCK_RESOLVED_ID` = `'\0virtual:conciv-extensions-dock'`, `WIDGET_DOCK_ROUTE` = `'/@conciv/widget-dock.js'` (`extensions.ts`).
- `ExtensionsSurface` = `'page' | 'dock'` (`extensions.ts`, internal).
- `extensionsModuleSource(apiBase?, embedEntry?, surface = 'page')` (`extensions.ts`): source of the virtual module. It imports `mountConciv` (page) or `createConciv` (dock) from `@conciv/embed` and mounts the widget with no extensions; for the dock surface it default-exports `concivDockRenderer(context)`. The page module mounts nothing when the page carries the dock module's script (`WIDGET_DOCK_ROUTE`), which only the docked `transformIndexHtml` injects, so a framework client entry that also imports the page module does not add a second widget.
- `concivSolidConfig({root?, warmupFiles?})` (`vite-plumbing.ts`): vite config fragment (`resolve.dedupe` and `optimizeDeps.exclude` for the Solid singletons, `@conciv/extension` and `@conciv/plugin`, filtered to those resolvable from root; `optimizeDeps.include: []`; `server.forwardConsole: false`; warmup clientFiles).
- `dropIncludedFromExcludes(optimizeDeps, managedIds)`, `resolveExtensionsModule(id)`, `loadExtensionsModule(id, apiBase?, embedEntry?)` (the page module for `EXTENSIONS_RESOLVED_ID`, the dock module for `EXTENSIONS_DOCK_RESOLVED_ID`), `isClientEntry(id)` (`id.includes('client-entry')`), `transformConcivModule(code, id, ssr)` (`vite-plumbing.ts`).
- `babel-presets.d.ts`: ambient declarations for `babel-preset-solid` and `@babel/preset-typescript`.

## Invariants

- `splitExtension` returns null unless the code matches `CONTRACT_MARKER` (`/\bdefine(Extension|Tool|Attachment)\b/`) (`split-extension.ts`).
- A call counts as a declaration only when its binding is a constant import of `defineExtension` / `defineTool` / `defineAttachment` from `@conciv/extension` or a subpath (aliases and chained terminators included); a terminator on a reassigned binding is left alone (`declarationKindOfBinding`, `binding.constant`).
- Node-side property stripping applies only to `defineExtension({...})` config objects and `Object.assign(extension, {...})`; computed keys are never stripped (`extensionConfigPath`, `objectAssignConfigPath`, `propertyKeyName`).
- Stamping runs `addSourceToJsx(code, id)` from `@tanstack/devtools-bundler-core`: each JSX element (host or component call site, not a Fragment, not one spreading the component's props) gets `data-tsd-source="<path>:<line>:<col>"`, the path relative to `process.cwd()` with a leading slash, or absolute when the file lies outside it. An element that already carries `data-tsd-source` is skipped, so a host that also runs `@tanstack/devtools-vite`'s injector gets one attribute per element. Positions are those of the code the transform receives. Paths containing `node_modules`, `?raw`, `/dist/` or `/build/` are not stamped (`vite-plumbing.ts`).
- `transformConcivModule` order: (1) for a non-SSR client entry not already referencing `EXTENSIONS_VIRTUAL_ID`, append `import('virtual:conciv-extensions')`; (2) skip `node_modules`; (3) for an extension module, split for the browser and compile with Solid; (4) otherwise stamp sources (`vite-plumbing.ts`).
- `resolveExtensionsModule` strips any `?` / `#` suffix before matching (`vite-plumbing.ts`).

## Side Effects

- Walks parent directories checking `node_modules/<pkg>/package.json` with `existsSync` (`resolvableFrom`, `vite-plumbing.ts`).
- The generated virtual module may set `window.__CONCIV_API_BASE__`, reads `<meta name="conciv-widget">`, listens on `window` for `DOCK_REVEAL_EVENT` (`@conciv/protocol/event-bus`), toggles `panel.inert`, and calls `mountConciv` / `createConciv(...).mount` (`extensionsModuleSource`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-compiler` from the repo root (turbo builds the package and its dependencies first)
