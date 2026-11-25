import {defineConfig} from 'vite'
import {nitroV2Plugin as nitro} from '@solidjs/vite-plugin-nitro-2'

import {solidStart} from '@solidjs/start/config'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@internal/e2e-utils/dev-endpoint'

export default defineConfig({
  plugins: [
    solidStart({solid: {exclude: /\/packages\/.*\/dist\/.*\.js(\?|$)/}}),
    nitro(),
    conciv({devEndpointDir: e2eDevEndpointDir(import.meta.dirname)}),
  ],
})
