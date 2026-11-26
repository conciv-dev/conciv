import {defineConfig} from 'vitest/config'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import conciv from '@conciv/unplugin/vite'
import UnoCSS from 'unocss/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(({mode}) => ({
  publicDir: false,
  plugins: [UnoCSS(), experimental(), conciv(), concivTest({browser: true})],
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
    ...(mode === 'test' ? {} : {'process.env.NODE_ENV': JSON.stringify('production')}),
  },
}))
