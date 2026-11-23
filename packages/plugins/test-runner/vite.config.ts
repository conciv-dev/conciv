import {defineConfig} from 'vitest/config'
import {experimental} from '@conciv/plugin/experimental/vite'
import conciv from '@conciv/unplugin/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  publicDir: false,
  plugins: [experimental(), conciv(), concivTest()],
})
