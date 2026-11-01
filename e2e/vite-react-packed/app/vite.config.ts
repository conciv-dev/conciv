import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [react(), conciv({devEndpointDir: process.env.CONCIV_E2E_DEV_ENDPOINT_DIR})],
})
