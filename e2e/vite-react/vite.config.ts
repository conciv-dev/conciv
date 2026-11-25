import {fileURLToPath, pathToFileURL} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir, e2ePluginCopyDir} from '@internal/e2e-utils/dev-endpoint'

const recorderPlugin = fileURLToPath(new URL('.', import.meta.resolve('@conciv/plugin-recorder/package.json')))

export default defineConfig({
  plugins: [
    react(),
    conciv({
      devEndpointDir: e2eDevEndpointDir(import.meta.dirname),
      plugins: [
        recorderPlugin,
        pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'live-line')).href,
        pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'host-controls')).href,
      ],
    }),
  ],
})
