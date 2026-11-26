import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({
  plugins: [UnoCSS(), solid(), concivTest({browser: true})],
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
