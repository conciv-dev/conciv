import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  plugins: [solid(), concivTest()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/cards.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'cards.js',
    },
    rollupOptions: {
      external: (source) =>
        !source.includes('.css') &&
        [/^solid-js/, /^zod/, /^@conciv\//, /^@tanstack\//, /^@orpc\//].some((pattern) => pattern.test(source)),
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
