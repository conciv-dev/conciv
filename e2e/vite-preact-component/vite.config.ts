import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'
import {E2E_DEV_ENDPOINT_DIR} from '@conciv/e2e-utils/dev-endpoint'

// https://vite.dev/config/
export default defineConfig({
  esbuild: {jsx: 'automatic', jsxImportSource: 'preact'},
  plugins: [conciv({widget: false, devEndpointDir: E2E_DEV_ENDPOINT_DIR})],
})
