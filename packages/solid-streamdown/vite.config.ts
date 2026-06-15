import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// Library build: Solid components compiled by vite-plugin-solid (the babel-preset-solid transform
// JSX needs). solid-js/shiki stay external (peers, provided by the host widget) so we don't bundle
// a second Solid runtime. styles.css ships alongside for the host to import.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store', 'shiki'],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
