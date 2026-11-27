import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'
import UnoCSS from 'unocss/vite'
import solid from 'vite-plugin-solid'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

const sourceDir = fileURLToPath(new URL('src/', import.meta.url))

const rpcFromPackage: Plugin = {
  name: 'page-rpc-from-package',
  enforce: 'pre',
  apply: 'build',
  applyToEnvironment: (environment) => environment.name === 'client',
  resolveId(source, importer) {
    if (source === './rpc.js' && importer?.startsWith(sourceDir)) return {id: '@conciv/plugin-page/rpc', external: true}
    return null
  },
}

const clientEntries = {
  client: 'src/client.ts',
  renderer: 'src/renderer.tsx',
  builtins: 'src/builtins.ts',
  'test-utils': 'src/test-utils.ts',
}

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [rpcFromPackage, UnoCSS(), solid(), concivTest({browser: true})],
    environments: {
      server: {entries: ['src/page.ts', 'src/rpc.ts', 'src/engine-builtins.ts']},
      client: {
        entries: clientEntries,
        bundle: true,
        external: [
          /^(@conciv\/|solid-js|effect|zod|es-toolkit|rrweb-snapshot|@zumer\/snapdom|lucide-solid|@tanstack\/|@solid-primitives\/)/,
        ],
      },
    },
  }),
)
