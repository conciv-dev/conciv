import {defineConfig} from 'vitest/config'
import {experimental} from '@conciv/frontend-plugin-api/vite'
import conciv from '@conciv/unplugin/vite'
import {concivTest} from '@internal/vitest-config/conciv-test'
import {concivKitTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  publicDir: false,
  plugins: [experimental(), conciv(), concivTest(), concivKitTest()],
})
