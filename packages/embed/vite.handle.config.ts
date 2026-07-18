import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  define: {'define.amd': 'false', 'process.env.NODE_ENV': '"production"'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('test/fixtures/handle-entry.ts', import.meta.url)),
      formats: ['iife'],
      name: 'ConcivHandle',
      fileName: () => 'conciv-handle.global.js',
    },
    outDir: 'test/dist',
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {output: {codeSplitting: false}},
  },
})
