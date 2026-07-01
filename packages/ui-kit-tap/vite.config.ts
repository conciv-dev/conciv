import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// Library build: Solid components compiled by vite-plugin-solid. solid-js stays external (a peer);
// TipTap/ProseMirror, @ark-ui, and the @mandarax workspace deps stay external too — the host widget
// installs and bundles them once, so this dist stays thin and the editor engine isn't duplicated.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: {index: fileURLToPath(new URL('src/index.tsx', import.meta.url))},
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^solid-js/, /^@ark-ui\//, /^@mandarax\//, /^@tiptap\//, /^prosemirror-/, /^@floating-ui\//],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
