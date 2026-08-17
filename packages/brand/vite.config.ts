import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: {
        solid: fileURLToPath(new URL('src/solid/conciv-lockup.tsx', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^solid-js/, /^motion/],
    },
    emptyOutDir: true,

    sourcemap: true,
  },
})
