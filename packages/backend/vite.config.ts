import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {concivTest} from '@internal/vitest-config/conciv-test'
import {concivKitTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  plugins: [solid(), concivTest(), concivKitTest()],
})
