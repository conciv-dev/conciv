import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@internal/e2e-utils/dev-endpoint'

// https://vite.dev/config/
export default defineConfig({
  esbuild: {jsx: 'automatic', jsxImportSource: 'preact'},
  plugins: [conciv({widget: false, devEndpointDir: e2eDevEndpointDir(import.meta.dirname)})],
})
