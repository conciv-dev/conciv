import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// Library build: Solid components compiled by vite-plugin-solid. solid-js stays external (a peer);
// @pierre/diffs (and the heavy shiki tree it carries) stay external too — they are a runtime
// dependency the consumer installs, so our dist stays thin and shiki dedupes with the host's copy.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^@pierre\/diffs/, /^shiki/, /^@shikijs\//],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
