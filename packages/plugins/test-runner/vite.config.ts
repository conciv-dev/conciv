import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'
import {experimental} from '@conciv/plugin/experimental/vite'
import conciv from '@conciv/unplugin/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'
import {ciReporting} from '@conciv/vitest-config'

export default defineConfig({
  publicDir: false,
  test: ciReporting(),
  plugins: [experimental(), conciv(), concivTest()],
  resolve: {alias: {'@conciv/plugin-internal': fileURLToPath(import.meta.resolve('@conciv/plugin-internal'))}},
})
