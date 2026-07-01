import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// Library build: Solid components compiled by vite-plugin-solid. solid-js stays a peer; zod,
// @tanstack/*, the @conciv workspace deps, and the heavy @pierre/diffs + shiki tree stay external
// so the dist is thin and the host widget bundles each once (no duplicate shiki / Ark).
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@tanstack\//, /^@conciv\//, /^@pierre\/diffs/, /^shiki/, /^@shikijs\//],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
