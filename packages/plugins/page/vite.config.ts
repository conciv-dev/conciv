import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@internal/vitest-config/conciv-test'
import {concivKitTest} from '@conciv/plugin-testkit/vitest'

const sourceDir = fileURLToPath(new URL('src/', import.meta.url))

const rpcFromPackage: Plugin = {
  name: 'page-rpc-from-package',
  enforce: 'pre',
  apply: 'build',
  resolveId(source, importer) {
    if (source === './rpc.js' && importer?.startsWith(sourceDir)) return {id: '@conciv/plugin-page/rpc', external: true}
    return null
  },
}

export default defineConfig({
  plugins: [rpcFromPackage, solid(), concivTest(), concivKitTest()],
  build: {
    lib: {
      entry: {
        client: fileURLToPath(new URL('src/client.ts', import.meta.url)),
        renderer: fileURLToPath(new URL('src/renderer.tsx', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external:
        /^(@conciv\/|solid-js|effect|zod|es-toolkit|rrweb-snapshot|@zumer\/snapdom|lucide-solid|@tanstack\/|@solid-primitives\/)/,
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
