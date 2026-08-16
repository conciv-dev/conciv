import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'

export default defineConfig({
  define: {'process.env.NODE_ENV': '"production"'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('fixtures/ws-probe.ts', import.meta.url)),
      formats: ['iife'],
      name: 'ConcivWsProbe',
      fileName: () => 'conciv-ws-probe.global.js',
    },
    outDir: 'e2e/dist',
    emptyOutDir: false,
    sourcemap: false,
  },
})
