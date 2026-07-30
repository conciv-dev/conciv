import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {E2E_DEV_ENDPOINT_DIR} from '@conciv/e2e-utils/dev-endpoint'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), conciv({devEndpointDir: E2E_DEV_ENDPOINT_DIR})],
})
