import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'
import {E2E_DEV_ENDPOINT_DIR} from '@conciv/e2e-utils/dev-endpoint'

export default defineConfig({
  plugins: [conciv({devEndpointDir: E2E_DEV_ENDPOINT_DIR})],
})
