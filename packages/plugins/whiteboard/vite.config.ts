import {defineConfig} from 'vitest/config'
import {experimental} from '@conciv/plugin/experimental/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'
import {ciReporting} from '@conciv/vitest-config'

export default defineConfig({
  publicDir: false,
  test: ciReporting(),
  plugins: [experimental(), concivTest()],
  define: {'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.IS_PREACT': JSON.stringify('false')},
})
