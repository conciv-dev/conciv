import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: (source) =>
        [/^solid-js/, /^zod/, /^@conciv\//, /^lucide-solid/].some((pattern) => pattern.test(source)),
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
