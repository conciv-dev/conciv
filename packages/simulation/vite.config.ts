import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest()],
    environments: {
      server: {
        entries: [
          'src/ai-testkit.ts',
          'src/scripted-harness.ts',
          'src/test-llm.ts',
          'src/backend/backend.ts',
          'src/driver.ts',
          'src/frontend.ts',
          'src/manifest.ts',
        ],
      },
    },
  }),
)
