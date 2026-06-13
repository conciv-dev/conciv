import {defineConfig} from 'vitest/config'

// The fixture's OWN config so the manager's createVitest({root: <fixture>}) resolves here
// (the nearest config) instead of walking up into the plugin's own vitest setup.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['*.test.ts'],
  },
})
