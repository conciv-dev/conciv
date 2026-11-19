import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/plugin-experimental.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'plugin-experimental.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^effect/, /^@conciv\/(?!plugin-internal)/, /^@solid-primitives\//],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
