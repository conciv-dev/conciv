import {pathToFileURL} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir, e2ePluginCopyDir} from '@internal/e2e-utils/dev-endpoint'

export default defineConfig({
  plugins: [
    react(),
    conciv({
      devEndpointDir: e2eDevEndpointDir(import.meta.dirname),
      plugins: [
        './node_modules/@conciv/plugin-recorder',
        pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'live-line')).href,
        pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'host-controls')).href,
      ],
    }),
  ],
})
