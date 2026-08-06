import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build, type Plugin, type PluginOption, type ResolvedConfig, type UserConfig} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {presetConciv} from '@conciv/uno-preset'
import {
  concivSolidConfig,
  loadExtensionsModule,
  resolveExtensionsModule,
  transformConcivModule,
} from '@conciv/extension-compiler/vite-plumbing'
import {type Builtins, NO_BUILTINS} from '@conciv/extension-compiler/extensions'

const VIRTUAL_ID = 'virtual:conciv-extension-under-test'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`

function concivBuildPlugin(builtins: Builtins): Plugin {
  let root = process.cwd()
  let deferToTsd = false
  return {
    name: 'conciv:build',
    enforce: 'pre',
    config: () => concivSolidConfig(),
    configResolved(config) {
      root = config.root
      deferToTsd = config.plugins.some((plugin) => plugin.name === '@tanstack/devtools:inject-source')
    },
    resolveId: (id) => resolveExtensionsModule(id),
    load: (id) =>
      loadExtensionsModule(id, builtins.clientEntries, undefined, builtins.embedEntry, builtins.dedupeEntry),
    transform(code, id, opts) {
      return transformConcivModule(code, id, opts?.ssr ?? false, {root, deferToTsd})
    },
  }
}

function extensionUnderTestPlugin(clientEntry: string): Plugin {
  return {
    name: 'conciv-testkit-extension-under-test',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null),
    load: (id) => (id === RESOLVED_VIRTUAL_ID ? `export {default} from ${JSON.stringify(clientEntry)}` : null),
  }
}

export type TestHostPluginOptions = {
  clientEntry?: string
  root?: string
  plugins?: PluginOption[]
}

function resolveClientEntry(options: TestHostPluginOptions, config: ResolvedConfig): string {
  if (options.clientEntry) return options.clientEntry
  const library = config.build.lib
  if (library && typeof library.entry === 'string') return resolve(config.root, library.entry)
  throw new Error('testHost needs a clientEntry when the surrounding build has no single library entry')
}

export function testHost(options: TestHostPluginOptions = {}): Plugin {
  let clientEntry = ''
  let outDir = ''
  return {
    name: 'conciv-testkit-test-host',
    apply: 'build',
    configResolved(config) {
      clientEntry = resolveClientEntry(options, config)
      outDir = join(config.root, 'dist', 'test-host')
    },
    closeBundle: async () => {
      await build({
        configFile: false,
        ...testHostConfig({clientEntry, outDir, root: options.root, plugins: options.plugins}),
      })
    },
  }
}

export type TestHostConfigOptions = {
  clientEntry: string
  outDir: string
  root?: string
  plugins?: PluginOption[]
}

export function testHostConfig(options: TestHostConfigOptions): UserConfig {
  const root = options.root ?? fileURLToPath(new URL('./host', import.meta.url))
  return {
    root,
    logLevel: 'silent',
    plugins: [
      concivBuildPlugin(NO_BUILTINS),
      extensionUnderTestPlugin(options.clientEntry),
      UnoCSS({
        configFile: false,
        presets: [presetConciv()],
        content: {pipeline: {include: [/\.[jt]sx?($|\?)/]}},
      }),
      ...(options.plugins ?? [solid()]),
    ],
    build: {
      outDir: options.outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: join(root, 'index.html'),
        output: {
          codeSplitting: {
            groups: [{name: 'shiki', test: /node_modules[\\/](shiki|@shikijs[\\/][^\\/]+)[\\/]/}],
          },
        },
      },
    },
  }
}
