import {defineConfig} from 'vitest/config'
import {experimental} from '@conciv/plugin/experimental/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  publicDir: false,
  plugins: [experimental(), concivTest()],
})
