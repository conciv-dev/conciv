import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'

export default defineConfig({
  test: {
    ...ciTest(),
    name: 'ui-kit-chat-tools',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
