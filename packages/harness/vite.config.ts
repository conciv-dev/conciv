import {defineConfig} from 'vite'
import {concivTest} from '@conciv/vitest-config/test-config'

export default defineConfig({
  plugins: [concivTest()],
})
