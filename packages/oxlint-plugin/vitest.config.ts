import {configDefaults, defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    environment: 'node',
    exclude: [...configDefaults.exclude, 'fixtures/**'],
  },
})
