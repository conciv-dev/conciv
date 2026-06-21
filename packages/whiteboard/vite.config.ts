import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// Library build: the extension graph compiled by vite-plugin-solid. solid-js stays a peer; zod,
// @tanstack/*, yjs, and the @mandarax workspace deps stay external (the host installs them). React
// and @excalidraw never enter this static graph — they load only via dynamic import inside render().
export default defineConfig({
  plugins: [solid()],
  // The island and Excalidraw must share ONE React instance, and Excalidraw branches on these flags.
  resolve: {dedupe: ['react', 'react-dom']},
  define: {'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.IS_PREACT': JSON.stringify('false')},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@tanstack\//, /^@mandarax\//, /^yjs/, /^y-protocols/],
    },
    emptyOutDir: true,
    sourcemap: true,
  },
})
