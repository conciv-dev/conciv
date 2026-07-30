import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  define: {'define.amd': 'false', 'process.env.NODE_ENV': '"production"'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/native-entry.ts', import.meta.url)),
      formats: ['iife'],
      name: 'ConcivWidgetNative',
      fileName: () => 'conciv-widget-native.global.js',
    },
    cssCodeSplit: false,
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {output: {codeSplitting: false}},
  },
})
