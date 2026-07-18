import {defineConfig} from 'vitest/config'
import {ciReporters} from './src/reporters.ts'

export default defineConfig({
  test: {
    reporters: ciReporters(),
  },
})
