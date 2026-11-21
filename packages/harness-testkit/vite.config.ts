import {defineConfig} from 'vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  plugins: [concivTest()],
})
