import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@conciv/e2e-utils/dev-endpoint'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), conciv({devEndpointDir: e2eDevEndpointDir(import.meta.dirname)})],
})
