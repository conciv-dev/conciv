import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  resolve: {conditions: ['browser', 'development']},
  ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
  test: {
    ...ciTest(),
    name: 'ui-kit-chat',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    server: {deps: {inline: ['solid-js']}},
  },
})
