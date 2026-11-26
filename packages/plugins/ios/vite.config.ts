import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({
  plugins: [solid(), concivTest()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@conciv\//],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
