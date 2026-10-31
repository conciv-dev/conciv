import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: (source) =>
        !source.includes('.css') &&
        [
          /^solid-js/,
          /^zod/,
          /^@conciv\//,
          /^lucide-solid/,
          /^rrweb($|\/)/,
          /^rrweb-player($|\/)/,
          /^@rrweb\//,
          /^@tanstack\//,
          /^@orpc\//,
          /^@zumer\//,
          /^@bramus\//,
        ].some((pattern) => pattern.test(source)),
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
