import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: {
        'stick-to-bottom': fileURLToPath(new URL('src/stick-to-bottom.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^solid-js/, /^@solid-primitives\//],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
