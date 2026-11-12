import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'
import ios from '@conciv/extension-ios'

export default defineConfig({
  server: {watch: {ignored: ['**/ConcivDemo/**', '**/ConcivWidget/**']}},
  plugins: [
    conciv({
      port: 4599,
      extensions: [
        ios({
          projectRoot: fileURLToPath(new URL('./ConcivDemo', import.meta.url)),
          bundleId: 'dev.conciv.ConcivDemo',
          simulator: 'iPhone 17 Pro',
          buildMode: 'swiftc',
          extraSourceDirs: ['../ConcivWidget/Sources/ConcivWidget'],
        }),
      ],
    }),
  ],
})
