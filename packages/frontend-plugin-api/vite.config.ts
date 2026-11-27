import {defineConfig} from 'vite'
import {libConfig} from '@internal/vite-config'
import {concivTest} from '@internal/vitest-config/conciv-test'

export default defineConfig(
  libConfig({
    root: import.meta.url,
    plugins: [concivTest({environment: 'happy-dom'})],
    environments: {
      server: {
        entries: {
          'frontend-plugin-api': 'src/frontend-plugin-api.ts',
          vite: 'src/vite.ts',
          host: 'src/host.ts',
          grab: 'src/grab.ts',
          page: 'src/page.ts',
        },
      },
    },
  }),
)
