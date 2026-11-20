import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'

export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  plugins: [
    experimental({
      entry: 'conciv/plugins/deploy/plugin-experimental.tsx',
      outFile: 'conciv/plugins/deploy/plugin-experimental.cjs',
    }),
  ],
})
