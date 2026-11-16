// @ts-check
import {defineConfig} from 'astro/config'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@conciv/e2e-utils/dev-endpoint'

export default defineConfig({
  vite: {
    plugins: [conciv({devEndpointDir: e2eDevEndpointDir(import.meta.dirname)})],
  },
})
