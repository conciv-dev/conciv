import {defineConfig} from 'vitest/config'
import {concivTest} from './src/conciv-test.ts'

export default defineConfig({
  plugins: [concivTest()],
})
