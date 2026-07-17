import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'solid-streamdown',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
