import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@internal/e2e-utils/dev-endpoint'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [react(), conciv({harness: 'pi', devEndpointDir: e2eDevEndpointDir(import.meta.dirname)})],
})
