# extension-compiler/src

## Overview

Build-time code for conciv extensions. It splits extension modules into browser and node halves with Babel and dead-code elimination, compiles extension TSX with `babel-preset-solid`, stamps `data-conciv-source` attributes onto JSX (oxc-parser + magic-string), and generates the `virtual:conciv-extensions` module that loads and dedupes extensions on the page or in a dock. It also loads server-side extensions from `<root>/conciv/extensions` through jiti.

## Interface

- `splitExtension(code, id, env: 'browser' | 'node')` -> `{code, map}` or null (`split-extension.ts`): browser output collapses `.server()`; node output collapses `.client()` / `.render()` / `.card()` and strips `Component` / `Surface` / `views`; both then run dead-code elimination. `SplitEnv` type.
- `compileExtensionSolid(code, id, ssr)` (`compile-extension.ts`): Babel with `babel-preset-solid` (`generate: 'ssr' | 'dom'`) and preset-typescript.
- `isExtensionModule(id)` (`compile-extension.ts`): matches paths under `/conciv/extensions/` ending in `.ts`, `.tsx`, `.js` or `.jsx`.
- `addSourceToJsx(code, id, root)` (`inject-source.ts`): appends `data-conciv-source="<relpath>:<line>:<col>"` to each JSX opening element.
- `EXTENSIONS_VIRTUAL_ID` = `'virtual:conciv-extensions'`, `EXTENSIONS_RESOLVED_ID` = `'\0virtual:conciv-extensions'`, `EXTENSIONS_ROUTE` = `'/@conciv/extensions.js'` (`extensions.ts`).
- `Builtins` type `{serverExtensions, clientEntries, embedEntry?, dedupeEntry?, nativePageDir?}`, `NO_BUILTINS`, `ExtensionsSurface` = `'page' | 'dock'` (`extensions.ts`).
- `extensionsModuleSource(clientEntries, apiBase?, embedEntry?, dedupeEntry?, surface = 'page')` (`extensions.ts`): source of the virtual module. It imports `mountConciv` (page) or `createConciv` (dock) from `@conciv/embed` and `loadExtensions` / `toSortedLoaders` from `@conciv/extension-compiler/dedupe`, and globs `EXTENSION_GLOB`. For the dock surface it default-exports `concivDockRenderer(context)`.
- `listExtensionFiles(root)` (`extensions.ts`): sorted basenames of `.ts/.tsx/.js/.jsx` files (not `.d.ts`) directly in `<root>/conciv/extensions`; not recursive.
- `loadExtensionPackages(root, resolveFrom, specifiers)` (`extensions.ts`): imports each specifier's default export with jiti anchored at `resolveFrom`.
- `loadServerExtensions(root, builtinServerExtensions)` (`extensions.ts`): evaluates folder extensions with a jiti instance that runs `splitExtension(..., 'node')` before its transform, then dedupes against the builtins.
- `EXTENSION_GLOB` = `'/conciv/extensions/*.{ts,tsx,js,jsx}'`, `dedupeExtensions(entries)` -> `DedupeResult {extensions, dropped}` (drop reasons `invalid-extension`, `duplicate-name:<name>`), `toSortedLoaders(glob)`, `loadExtensions(loaders)`, `extensionLabel(source)`; types `ExtensionEntry`, `ExtensionLoader`, `DedupeResult` (`dedupe-extensions.ts`).
- `isExtension(value)` (`extension-guard.ts`): object with a non-empty string `name`.
- `concivSolidConfig({root?, warmupFiles?})` (`vite-plumbing.ts`): vite config fragment (`resolve.dedupe` and `optimizeDeps.exclude` for the Solid singletons and `@conciv/extension`, filtered to those resolvable from root; `optimizeDeps.include: []`; `server.forwardConsole: false`; warmup clientFiles).
- `dropIncludedFromExcludes(optimizeDeps, managedIds)`, `resolveExtensionsModule(id)`, `loadExtensionsModule(id, clientEntries, apiBase?, embedEntry?, dedupeEntry?, surface?)`, `isClientEntry(id)` (`id.includes('client-entry')`), `transformConcivModule(code, id, ssr, {root, deferToTsd})` (`vite-plumbing.ts`).
- `babel-presets.d.ts`: ambient declarations for `babel-preset-solid` and `@babel/preset-typescript`.

## Invariants

- `splitExtension` returns null unless the code matches `CONTRACT_MARKER` (`/\bdefine(Extension|Tool|Attachment)\b/`) (`split-extension.ts`).
- A call counts as a declaration only when its binding is a constant import of `defineExtension` / `defineTool` / `defineAttachment` from `@conciv/extension` or a subpath (aliases and chained terminators included); a terminator on a reassigned binding is left alone (`declarationKindOfBinding`, `binding.constant`).
- Node-side property stripping applies only to `defineExtension({...})` config objects and `Object.assign(extension, {...})`; computed keys are never stripped (`extensionConfigPath`, `objectAssignConfigPath`, `propertyKeyName`).
- `addSourceToJsx` returns null for non-`.jsx`/`.tsx` files, for code already containing `data-tsd-source` or `data-conciv-source`, on parse failure, or with no JSX; it skips `Fragment` / `React.Fragment` / empty names and elements that already carry the attribute. The value is JSON-stringified (`inject-source.ts`).
- Positions come from the on-disk file only when its opening-element count equals the transformed code's count, otherwise from the transformed code (`diskPositions`).
- Dedupe is first-wins by `name`, and builtins are listed first, so builtins win collisions (`dedupeExtensions`, `loadServerExtensions`, `extensionsModuleSource`).
- A folder extension without a default export throws `conciv extension <file> has no default export`; a builtin package without one throws `conciv builtin extension <specifier> has no default export` (`extensions.ts`).
- `listExtensionFiles` returns `[]` only for ENOENT and rethrows other fs errors (`isMissingDirError`).
- `transformConcivModule` order: (1) for a non-SSR client entry not already referencing `EXTENSIONS_VIRTUAL_ID`, append `import('virtual:conciv-extensions')`; (2) skip `node_modules`; (3) for an extension module, split for the browser and compile with Solid; (4) return null when `deferToTsd`; (5) otherwise stamp sources (`vite-plumbing.ts`).
- `resolveExtensionsModule` strips any `?` / `#` suffix before matching (`vite-plumbing.ts`).
- A module load failure matching `/dynamically imported module|Importing a module script failed/` produces a toast that mentions content blockers such as uBlock Origin (`isModuleLoadFailure`, `dedupe-extensions.ts`).

## Side Effects

- Reads `<root>/conciv/extensions` (`readdirSync`, `readFileSync` in `listExtensionFiles` / `loadServerExtensions`).
- Evaluates user extension code in-process through jiti `evalModule` with `fsCache: false` (`createSplittingJiti`) and imports packages through jiti (`loadExtensionPackages`).
- Reads the on-disk source of the file being transformed (`diskPositions`, `inject-source.ts`).
- Walks parent directories checking `node_modules/<pkg>/package.json` with `existsSync` (`resolvableFrom`, `vite-plumbing.ts`).
- `console.error` for dropped server extensions and failed loads (`loadServerExtensions`, `loadExtensions`); the generated module calls `console.warn('conciv extension dropped:', ...)`.
- The generated virtual module may set `window.__CONCIV_API_BASE__`, reads `<meta name="conciv-widget">`, listens on `window` for `DOCK_REVEAL_EVENT` (`@conciv/protocol/event-bus`), toggles `panel.inert`, and calls `mountConciv` / `createConciv(...).mount` (`extensionsModuleSource`).
- On any load failure `loadExtensions` appends a synthetic `conciv-load-failures` extension that shows an error toast through `getExtensionApi(...).useToast()` (`dedupe-extensions.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-compiler` from the repo root (turbo builds the package and its dependencies first)
