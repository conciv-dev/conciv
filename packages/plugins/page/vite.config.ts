import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig(({command}) => ({
  publicDir: false,
  plugins: [experimental(), concivTest()],
  define: command === 'build' ? {'process.env.NODE_ENV': JSON.stringify('production')} : {},
}))
