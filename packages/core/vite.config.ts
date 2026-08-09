import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/cards.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'cards.js',
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
        ].some((pattern) => pattern.test(source)),
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
