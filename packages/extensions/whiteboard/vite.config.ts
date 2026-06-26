import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [solid(), wasm()],
  resolve: {dedupe: ['react', 'react-dom']},
  define: {'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.IS_PREACT': JSON.stringify('false')},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@mandarax\//, /^node:/, /^oxc-parser/],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
