import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  esbuild: {jsx: 'automatic', jsxImportSource: 'preact'},
  plugins: [conciv({widget: false})],
})
