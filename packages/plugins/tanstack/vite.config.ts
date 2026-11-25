import {defineConfig} from 'vite'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'
import {concivKitTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  publicDir: false,
  plugins: [experimental(), concivTest(), concivKitTest()],
})
