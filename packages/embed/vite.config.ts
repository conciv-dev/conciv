import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'

const EXTERNAL_PREFIXES = ['solid-js/', 'effect/', '@ark-ui/', '@conciv/']

const INLINED_PREFIXES = [
  '@conciv/plugin-page/client',
  '@conciv/plugin-page/renderer',
  '@conciv/app',
  '@conciv/builtin-plugins',
  '@conciv/plugin-internal',
  '@conciv/plugin-tanstack',
  '@conciv/tools',
  '@conciv/core',
]

const isExternal = (id: string): boolean => {
  if (id.endsWith('?inline')) return false
  if (INLINED_PREFIXES.some((prefix) => id.startsWith(prefix))) return false
  return id === 'solid-js' || id === 'effect' || EXTERNAL_PREFIXES.some((prefix) => id.startsWith(prefix))
}

export default defineConfig({
  plugins: [UnoCSS(), solid()],

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
