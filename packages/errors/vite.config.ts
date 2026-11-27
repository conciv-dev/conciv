import {defineConfig, mergeConfig} from 'vitest/config'
import {libConfig} from '@internal/vite-config'

export default defineConfig(
  mergeConfig(libConfig({root: import.meta.url, environments: {server: {entries: ['src/errors.ts']}}}), {
    test: {include: ['test/unit/**/*.unit.test.ts']},
  }),
)
