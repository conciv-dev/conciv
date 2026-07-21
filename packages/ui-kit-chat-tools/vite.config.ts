import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@conciv\//, /^@pierre\/diffs/, /^shiki/, /^@shikijs\//, /^lucide-solid/],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
