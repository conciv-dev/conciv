import {defineConfig} from 'vitest/config'
import {kitDefaults, nodeProject} from '@internal/vitest-config/test-config'

export default defineConfig({
  test: {...kitDefaults(), projects: [nodeProject()]},
})
