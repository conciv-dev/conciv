import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// The browser view (client.ts + the Solid card) compiled by vite-plugin-solid. solid-js, zod,
// lucide-solid, and the @mandarax workspace deps stay external — the host widget bundles them once
// and dedupes solid-js. emptyOutDir:false so this lands beside the tsdown node outputs.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@mandarax\//, /^lucide-solid/],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
