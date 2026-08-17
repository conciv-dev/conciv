import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'
import {brandAssetsAlias} from './brand-assets-alias'

export default defineConfig({
  resolve: {
    alias: brandAssetsAlias,
  },
  test: {
    ...ciTest(),
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.it.test.ts'],
  },
})
