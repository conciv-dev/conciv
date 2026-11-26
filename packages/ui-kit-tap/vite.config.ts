import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: {'ui-kit-tap': fileURLToPath(new URL('src/ui-kit-tap.tsx', import.meta.url))},
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^solid-js/, /^@ark-ui\//, /^@conciv\//, /^@tiptap\//, /^prosemirror-/, /^@floating-ui\//],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
