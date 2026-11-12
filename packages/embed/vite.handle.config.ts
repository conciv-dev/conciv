import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [UnoCSS(), solid()],
  define: {'define.amd': 'false', 'process.env.NODE_ENV': '"production"'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('test/fixtures/handle-entry.tsx', import.meta.url)),
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
