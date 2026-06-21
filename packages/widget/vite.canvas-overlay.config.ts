import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

// The lazy canvas-overlay bundle: Excalidraw (React island) + Solid pins, built as its own IIFE that
// core serves and the widget injects on toggle — so the ~1MB React+Excalidraw never enters the base
// widget bundle. solid() transpiles the Solid pins (.tsx); React is used via createElement in .ts and
// left alone. Phase-1 findings baked in: dedupe react, process.env shims, skip the UnoCSS postcss.
export default defineConfig({
  plugins: [solid()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.IS_PREACT': JSON.stringify('false'),
    'define.amd': 'false',
  },
  css: {postcss: {plugins: []}},
  resolve: {dedupe: ['react', 'react-dom']},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/canvas-overlay/entry.ts', import.meta.url)),
      formats: ['iife'],
      name: 'MandaraxCanvas',
      fileName: () => 'canvas-overlay.global.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    sourcemap: false,
  },
})
