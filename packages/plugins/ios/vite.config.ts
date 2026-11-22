import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@conciv/plugin-testkit/vitest'

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
