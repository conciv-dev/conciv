import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

const isExternal = (id: string): boolean =>
  id === 'solid-js' ||
  id.startsWith('solid-js/') ||
  id.startsWith('@ark-ui/') ||
  (id.startsWith('@conciv/') && !id.startsWith('@conciv/page'))

export default defineConfig({
  plugins: [solid()],

  define: {'define.amd': 'false'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/mount.tsx', import.meta.url)),
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
