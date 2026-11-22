import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'
import {e2eDevEndpointDir} from '@conciv/e2e-utils/dev-endpoint'

const recorderPlugin = fileURLToPath(new URL('.', import.meta.resolve('@conciv/plugin-recorder/package.json')))

export default defineConfig({
  plugins: [conciv({devEndpointDir: e2eDevEndpointDir(import.meta.dirname), plugins: [recorderPlugin]})],
})
