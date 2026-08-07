import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {testHostConfig} from '@conciv/extension-testkit/test-host'

export default defineConfig({
  ...testHostConfig({
    root: fileURLToPath(new URL('./test/host', import.meta.url)),
    plugins: [react()],
    clientEntry: fileURLToPath(new URL('./dist/client.js', import.meta.url)),
    outDir: fileURLToPath(new URL('./dist/test-host', import.meta.url)),
  }),
  resolve: {
    alias: {
      'virtual:conciv-connect-probe': fileURLToPath(
        new URL('./test/host/conciv/extensions/connect-probe.tsx', import.meta.url),
      ),
    },
  },
})
