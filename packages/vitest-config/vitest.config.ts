import {configDefaults, defineConfig} from 'vitest/config'
import {ciTest} from './src/reporters.ts'

export default defineConfig({
  test: {
    ...ciTest(),
    exclude: [...configDefaults.exclude, 'test/fixtures/**'],
  },
})
