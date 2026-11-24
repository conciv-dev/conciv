import {defineConfig} from 'vitest/config'
import {ciTest} from '@internal/vitest-config'

export default defineConfig({
  test: {...ciTest(), environment: 'node', include: ['src/**/*.test.js']},
})
