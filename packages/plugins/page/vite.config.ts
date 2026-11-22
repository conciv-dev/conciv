import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

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

export default defineConfig(({mode}) => ({
  plugins: [rpcFromPackage, ...(mode === 'test' ? [] : [UnoCSS()]), solid(), concivTest()],
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
        /^(@conciv\/|solid-js|effect|zod|es-toolkit|bippy|react-grab|rrweb-snapshot|@zumer\/snapdom|ai-motion|js-beautify|lucide-solid|@tanstack\/|@solid-primitives\/|@jridgewell\/)/,
    },
    emptyOutDir: false,
    sourcemap: true,
  },
}))
