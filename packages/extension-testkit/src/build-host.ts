import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {build, type Plugin, type PluginOption} from 'vite'
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
    load: (id) => loadExtensionsModule(id, builtins.clientEntries, undefined, builtins.embedEntry, builtins.dedupeEntry),
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

export type BuildConcivHostOptions = {
  root: string
  input?: string
  plugins: PluginOption[]
  clientEntry: string
}

export async function buildConcivHost(options: BuildConcivHostOptions): Promise<string> {
  const outDir = await mkdtemp(join(tmpdir(), 'conciv-testkit-host-'))
  const input = options.input ?? join(options.root, 'index.html')
  await build({
    root: options.root,
    configFile: false,
    logLevel: 'silent',
    plugins: [concivBuildPlugin(NO_BUILTINS), extensionUnderTestPlugin(options.clientEntry), ...options.plugins],
    build: {outDir, emptyOutDir: true, rollupOptions: {input}},
  })
  return outDir
}
