import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  define: {'define.amd': 'false'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('test/fixtures/global-entry.ts', import.meta.url)),
      formats: ['iife'],
      name: 'ConcivWidget',
      fileName: () => 'conciv-widget.global.js',
    },
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: true,
  },
})
