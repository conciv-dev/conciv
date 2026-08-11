import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('src/index.ts', import.meta.url)),
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
