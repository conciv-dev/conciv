import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@internal/vitest-config/conciv-test'
import {concivKitTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  plugins: [solid(), concivTest(), concivKitTest()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/plugin-experimental.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'plugin-experimental.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^effect/, /^@conciv\//, /^@solid-primitives\//],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
