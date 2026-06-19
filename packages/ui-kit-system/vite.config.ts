import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// Library build: Solid components compiled by vite-plugin-solid. solid-js stays external (a peer);
// @ark-ui, lucide-solid, and the @mandarax workspace deps stay external too — the host widget installs
// and bundles them once, so this dist stays thin and Ark isn't duplicated across tool-ui + widget.
// tokens.css ships alongside for the host to import.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^@ark-ui\//, /^lucide-solid/, /^@mandarax\//],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
