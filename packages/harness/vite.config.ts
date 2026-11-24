import {defineConfig} from 'vite'
import {concivTest} from '@internal/vitest-config/test-config'

export default defineConfig({
  plugins: [concivTest()],
})
