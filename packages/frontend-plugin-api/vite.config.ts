import {defineConfig} from 'vite'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig({
  plugins: [concivTest({environment: 'happy-dom'})],
})
