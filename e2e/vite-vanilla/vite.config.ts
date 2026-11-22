import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@conciv/e2e-utils/dev-endpoint'

export default defineConfig({
  plugins: [conciv({devEndpointDir: e2eDevEndpointDir(import.meta.dirname)})],
})
