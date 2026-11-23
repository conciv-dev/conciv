import {fileURLToPath, pathToFileURL} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
import {e2ePluginCopyDir} from '@conciv/e2e-utils/state-dir'

const recorderPlugin = fileURLToPath(new URL('.', import.meta.resolve('@conciv/plugin-recorder/package.json')))

export default defineConfig({
  plugins: [
    react(),
    conciv({
      plugins: [
        recorderPlugin,
        pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'live-line')).href,
        pathToFileURL(e2ePluginCopyDir(import.meta.dirname, 'host-controls')).href,
      ],
    }),
  ],
})
