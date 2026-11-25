import {defineConfig} from 'vite'
import {concivTest} from '@internal/vitest-config/conciv-test'
import {concivKitTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  plugins: [concivTest(), concivKitTest()],
})
