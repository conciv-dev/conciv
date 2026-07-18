import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

const EXTERNAL_PREFIXES = ['solid-js/', '@ark-ui/', '@conciv/']

const isExternal = (id: string): boolean => {
  if (id.startsWith('@conciv/page')) return false
  return id === 'solid-js' || EXTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix))
}

export default defineConfig({
  plugins: [solid()],

  define: {'define.amd': 'false'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/mount.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'mount.js',
    },
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: isExternal,
    },
  },
})
