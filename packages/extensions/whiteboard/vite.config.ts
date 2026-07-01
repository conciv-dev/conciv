import {fileURLToPath} from 'node:url'
import {defineConfig, type PluginOption} from 'vite'
import solid from 'vite-plugin-solid'
import wasmPlugin from 'vite-plugin-wasm'

const wasm = wasmPlugin as unknown as () => PluginOption

export default defineConfig({
  plugins: [solid(), wasm()],
  resolve: {dedupe: ['react', 'react-dom']},
  define: {'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.IS_PREACT': JSON.stringify('false')},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@conciv\//, /^node:/, /^oxc-parser/],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
