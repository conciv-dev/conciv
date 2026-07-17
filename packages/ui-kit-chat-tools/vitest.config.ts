import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'ui-kit-chat-tools',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
