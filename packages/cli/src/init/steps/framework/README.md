# cli/src/init/steps/framework

## Overview

The framework wiring step for each bundler. Vite, Next.js and webpack/rspack configs are edited through ast-grep transforms in `engine.ts`; when a config's shape cannot be proven, the step returns a manual card. Rollup, esbuild and unknown projects get manual cards only.

## Interface

- `viteStep(detected)` (`vite.ts`): adds `conciv()` from @conciv/it/plugin/vite to the plugins array; also used for astro
- `nextjsStep(detected)` (`nextjs.ts`): wraps the next config default export with `withConciv` from @conciv/it/plugin/nextjs and creates instrumentation.ts and instrumentation-client.ts
- `webpackFamilyStep(detected)` (`webpack-family.ts`): adds @conciv/it/plugin/webpack or /rspack, with require for CJS configs and a default import for ESM configs
- `fallbackStep(detected)` (`fallback.ts`): manual-only step with a rollup, esbuild or unknown card
- `readConfig` / `writeConfigChange` / `ConfigFile` (`config-edit.ts`): read the config, and write it after a backup while emitting a colored diff note
- `addToPluginsArray` / `addToPluginsArrayRequire` (`engine.ts`): ESM import or CJS require plus a plugin call appended; return `Transform` {matched, output}
- `wrapDefaultExport(source, wrapperName, importFrom)` (`engine.ts`): wraps `export default X` as `wrapper(X)` and adds a named import
- `pluginCallWired` / `defaultExportWrapped` (`engine.ts`): checks that an edit is already in place
- `moduleStyle(source)` / `ModuleStyle` (`engine.ts`): 'cjs' | 'esm' | 'ambiguous'

## Invariants

- `bindingState` (`engine.ts`): a module already imported under another binding, an identifier already in use, or a shadowed `require` is a conflict and the transform returns unmatched
- `pluginsArray` (`engine.ts`): needs exactly one `plugins` array in the exported config object or one level down, behind a single `export default` or `module.exports =`; anything else is unmatched
- `addToPluginsArrayRequire` (`engine.ts`): unmatched when the file has any import statement
- `addToPluginsArray` / `wrapDefaultExport` (`engine.ts`): idempotent; no duplicate call and no duplicate import
- `wrapDefaultExport` (`engine.ts`): wraps only identifier, call_expression or member_expression default exports
- `webpackFamilyStep` (`webpack-family.ts`): an ambiguous `moduleStyle` gives manual cards; apply always ends manual because the widget URL card still applies
- `nextjsStep` (`nextjs.ts`): an instrumentation file with other content is not overwritten; a file counts as wired only when its trimmed content equals the expected line
- `fallbackStep` (`fallback.ts`): detect is always missing, verify always false, apply always manual
- `vite.ts`, `webpack-family.ts`, `nextjs.ts`: a missing config file gives a manual snippet card and no write

## Side Effects

- `writeConfigChange` (`config-edit.ts`): backs up and writes the config with writeFileSync and emits a colored unified diff note
- `wireFile` (`nextjs.ts`): backs up and creates instrumentation.ts and instrumentation-client.ts
- `readConfig` (`config-edit.ts`) and `fileState` (`nextjs.ts`): read files from disk

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/cli` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/cli && pnpm typecheck && pnpm lint`
