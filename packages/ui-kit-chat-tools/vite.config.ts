import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// Library build: Solid components compiled by vite-plugin-solid. solid-js stays a peer; the @mandarax
// workspace deps (incl. ui-kit-chat), the heavy @pierre/diffs + shiki tree, and js-beautify stay
// external so the dist is thin and the host widget bundles each once.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        /^solid-js/,
        /^zod/,
        /^@mandarax\//,
        /^@pierre\/diffs/,
        /^shiki/,
        /^@shikijs\//,
        /^js-beautify/,
        /^lucide-solid/,
      ],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
