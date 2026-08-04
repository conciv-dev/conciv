import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {testHostConfig} from '@conciv/extension-testkit/test-host'

export default defineConfig(
  testHostConfig({
    clientEntry: '@conciv/extension-terminal/client',
    outDir: fileURLToPath(new URL('./dist/test-host', import.meta.url)),
  }),
)
