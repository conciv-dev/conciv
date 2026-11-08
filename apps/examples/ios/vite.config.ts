import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [
    conciv({
      port: 4599,
      extensions: {
        ios: {
          projectRoot: fileURLToPath(new URL('../../../native/swift/ConcivDemo', import.meta.url)),
          bundleId: 'dev.conciv.ConcivDemo',
          simulator: 'iPhone 17 Pro',
          buildMode: 'swiftc',
          extraSourceDirs: ['../ConcivWidget/Sources/ConcivWidget'],
        },
      },
    }),
  ],
})
