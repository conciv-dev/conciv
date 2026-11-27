import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest()],
    environments: {
      server: {
        entries: ['src/grab.ts'],
      },
    },
  }),
)
