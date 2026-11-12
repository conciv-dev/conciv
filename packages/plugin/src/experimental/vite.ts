import {isBuiltin} from 'node:module'
import path from 'node:path'
import type {Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import {pluginSharedModules, pluginWindowModules} from './modules.js'

/** Where `experimental()` reads a plugin's app part and writes its `./plugin-experimental` bundle. */
export interface ExperimentalOptions {
  /** The module whose default export is the plugin's `Plugin.define`. Defaults to `src/plugin-experimental.tsx`. */
  readonly entry?: string
  /**
   * The CommonJS bundle to write, the file `./plugin-experimental` exports. Defaults to
   * `dist/plugin-experimental.cjs`.
   */
  readonly outFile?: string
}

/** The modules the app provides to a plugin's app part, each the app's own instance; the bundle must not include a copy. */
const provided = new Set<string>([...pluginSharedModules, ...pluginWindowModules])

/**
 * Builds a plugin's `./plugin-experimental` bundle with Vite: compiles Solid JSX, writes one CommonJS file with every
 * dynamic `import()` inlined, since the app loads no second chunk, and keeps the modules the app provides external,
 * with Node built-ins. Another module of Solid or conciv fails the build: the app does not provide it, and a bundled
 * copy would not share the app's instance.
 *
 * @param options - The entry and the bundle to write.
 * @returns The Vite plugins.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * export default defineConfig({ plugins: [experimental()] })
 * ```
 */
export function experimental(options: ExperimentalOptions = {}): Plugin[] {
  const outFile = options.outFile ?? 'dist/plugin-experimental.cjs'

  return [
    solid(),
    {
      name: 'conciv-experimental',
      enforce: 'pre',
      config: () => ({
        build: {
          outDir: path.dirname(outFile),
          emptyOutDir: false,
          lib: {
            entry: options.entry ?? 'src/plugin-experimental.tsx',
            formats: ['cjs'],
            fileName: () => path.basename(outFile),
          },
          rollupOptions: {output: {exports: 'named', inlineDynamicImports: true}},
        },
      }),
      resolveId(source) {
        if (provided.has(source) || isBuiltin(source)) return {id: source, external: true}

        if (/^(solid-js|@conciv)\//.test(source))
          this.error(`${source} is not a module the conciv app provides to plugins: ${[...provided].join(', ')}`)
      },
    },
  ]
}
