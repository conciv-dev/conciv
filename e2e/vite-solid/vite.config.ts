import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import conciv from '@conciv/it/plugin/vite'
import {pathToFileURL} from 'node:url'
import {e2eDevEndpointDir, e2ePluginCopyDir} from '@conciv/e2e-utils/dev-endpoint'

export default defineConfig({
  plugins: [
    solid(),
    conciv({
      devEndpointDir: e2eDevEndpointDir(import.meta.dirname),
      plugins: [pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'live-line')).href],
    }),
  ],
})
