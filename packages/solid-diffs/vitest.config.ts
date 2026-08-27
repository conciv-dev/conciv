import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {conditions: ['browser', 'development'], dedupe: ['solid-js']},
  ssr: {resolve: {conditions: ['browser', 'development'], externalConditions: ['browser', 'development']}},
  test: {
    name: 'solid-diffs',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    server: {deps: {inline: ['solid-js', '@tanstack/solid-pacer', '@tanstack/solid-store']}},
  },
})
