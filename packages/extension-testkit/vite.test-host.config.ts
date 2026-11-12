import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {testHostConfig} from './src/test-host-config.js'

export default defineConfig(
  testHostConfig({
    clientEntry: fileURLToPath(new URL('./test/fixtures/ping/client.tsx', import.meta.url)),
    outDir: fileURLToPath(new URL('./dist/test-host', import.meta.url)),
  }),
)
