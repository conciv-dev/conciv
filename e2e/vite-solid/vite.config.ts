import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@internal/e2e-utils/dev-endpoint'

export default defineConfig({
  plugins: [
    solid(),
    conciv({
      devEndpointDir: e2eDevEndpointDir(import.meta.dirname),
    }),
  ],
})
