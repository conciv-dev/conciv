import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  plugins: [experimental(), concivTest()],
  resolve: {alias: {'@conciv/plugin-internal': fileURLToPath(import.meta.resolve('@conciv/plugin-internal'))}},
})
