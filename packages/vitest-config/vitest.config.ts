import {defineConfig} from 'vitest/config'
import {ciTest} from './src/reporters.ts'

export default defineConfig({
  test: {
    ...ciTest(),
  },
})
