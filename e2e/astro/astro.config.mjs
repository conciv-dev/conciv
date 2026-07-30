// @ts-check
import {defineConfig} from 'astro/config'
import conciv from '@conciv/it/plugin/vite'
import {E2E_DEV_ENDPOINT_DIR} from '@conciv/e2e-utils/dev-endpoint'

export default defineConfig({
  vite: {
    plugins: [conciv({devEndpointDir: E2E_DEV_ENDPOINT_DIR})],
  },
})
