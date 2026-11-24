import {isBuiltin} from 'node:module'
import path from 'node:path'
import type {Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import {pluginSharedModules, pluginWindowModules} from './modules.js'

export interface ExperimentalOptions {
  readonly entry?: string
  readonly outFile?: string
}

const provided = new Set<string>([...pluginSharedModules, ...pluginWindowModules])

/**
 * Builds a plugin's `./plugin-experimental` bundle with Vite: compiles Solid JSX, writes a CommonJS entry plus one
 * chunk per dynamic `import()`, which the app loads on demand over its engine socket, with Vite's manifest beside the
 * entry, and keeps the modules the app provides external, with Node built-ins. Another module of Effect, Solid or
 * conciv fails the build: the app does not provide it, and a bundled copy would not share the app's instance.
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
    {...solid(), apply: 'build'},
    {
      name: 'conciv-experimental',
      apply: 'build',
      enforce: 'pre',
      config: () => ({
        build: {
          outDir: path.dirname(outFile),
          emptyOutDir: false,
          manifest: `${path.basename(outFile)}.manifest.json`,
          lib: {
            entry: options.entry ?? 'src/plugin-experimental.tsx',
            formats: ['cjs'],
            fileName: () => path.basename(outFile),
          },
          rollupOptions: {output: {exports: 'named', chunkFileNames: '[name]-[hash].cjs'}},
        },
      }),
      generateBundle() {
        const types = path.basename(outFile, '.cjs')
        this.emitFile({
          type: 'asset',
          fileName: `${types}.d.cts`,
          source: `declare const definition: typeof import('./${types}.js', {with: {'resolution-mode': 'import'}}).default\nexport default definition\n`,
        })
      },
      resolveId(source) {
        if (provided.has(source) || isBuiltin(source)) return {id: source, external: true}

        if (/^@conciv\/plugin-[^/]+\/contract$/.test(source)) return null

        if (/^(effect|solid-js|@conciv)\//.test(source))
          this.error(`${source} is not a module the conciv app provides to plugins: ${[...provided].join(', ')}`)
      },
    },
  ]
}
