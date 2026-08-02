import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {testHostConfig} from '@conciv/extension-testkit/test-host'

export default defineConfig(
  testHostConfig({
    clientEntry: fileURLToPath(new URL('./test/fixture/connect-pane-fixture.tsx', import.meta.url)),
    outDir: fileURLToPath(new URL('./dist/test-host', import.meta.url)),
  }),
)
