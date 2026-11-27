import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import UnoCSS from 'unocss/vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({
  plugins: [UnoCSS(), solid(), concivTest()],
  build: {
    lib: {
      entry: {builtins: fileURLToPath(new URL('src/builtins.ts', import.meta.url))},
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@conciv\//],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
