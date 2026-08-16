import {defineConfig} from 'vite'
import {nitroV2Plugin as nitro} from '@solidjs/vite-plugin-nitro-2'

import {solidStart} from '@solidjs/start/config'
import conciv from '@conciv/it/plugin/vite'
import {E2E_DEV_ENDPOINT_DIR} from '@conciv/e2e-utils/dev-endpoint'

export default defineConfig({
  plugins: [
    solidStart({solid: {exclude: /\/packages\/.*\/dist\/.*\.js(\?|$)/}}),
    nitro(),
    conciv({devEndpointDir: E2E_DEV_ENDPOINT_DIR}),
  ],
})
